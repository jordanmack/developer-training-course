"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultWitnessPlaceholders, collectCapacity, describeTransaction: libDescribeTransaction, getLiveCell, indexerReady, readFileToHexString, sendTransaction, signMessage, waitForConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {ckbytesToShannons, formattedNumber, getRandomInt, hexToInt, intToHex} = require("../lib/util.js");

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showInputs: true,
		showInputType: false,
		showInputData: true,
		showOutputs: true,
		showOutputType: false,
		showOutputData: true,
		showWitnesses: false
	};

	return libDescribeTransaction(transaction, options);
}

async function initializeLumosSkeleton(indexer)
{
	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	return skeleton;
}

async function initializeLab(nodeUrl, indexer)
{
	// Setup the Cells for the lab.
	await setupCells(nodeUrl, indexer);
	await indexerReady(indexer);

	// Initialize a tx skeleton.
	const transaction = await initializeLumosSkeleton(indexer);

	return {transaction};
}

async function setupCells(nodeUrl, indexer)
{
	// Genesis account.
	const privateKey1 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
	const address1 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";	

	// Account to fund.
	const privateKey2 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
	const address2 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

	// Contents for Cell data.
	const dataFile1 = "../files/HelloNervos.txt";

	// Transaction Fee
	const txFee = 100_000n;

	// Initialize a Lumos instance.
	let transaction = await initializeLumosSkeleton(indexer);

	// Flags to track which addresses were used.
	let addressUsed1 = false;
	let addressUsed2 = false;

	// Recycle all existing cells to inputs.
	const query = {lock: addressToScript(address2), type: "empty"};
	const cellCollector = new CellCollector(indexer, query);
	let recycleCells = [];
	for await (const cell of cellCollector.collect())
		recycleCells.push(cell);
	if(recycleCells.length > 0)
		addressUsed2 = true;
	transaction = transaction.update("inputs", (i)=>i.concat(recycleCells));

	// Determine the capacity from recycled Cells.
	const recycleCapacity = recycleCells.reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create cells for the funding address.
	let outputCapacityTotal = 0n;
	while(outputCapacityTotal < ckbytesToShannons(5000n))
	{
		const outputCapacity = intToHex(ckbytesToShannons(getRandomInt(500, 1000)) + BigInt(getRandomInt(1, 10_000_000)));
		const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(address2), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output));	
		outputCapacityTotal += hexToInt(outputCapacity);
	}

	// Create a cell for funding address with specific data.
	for(let i = 0; i < 2; i++)
	{
		const {hexString} = await readFileToHexString(dataFile1);
		const outputCapacity1 = intToHex(ckbytesToShannons(74n));
		const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address2), type: null}, data: hexString};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Get the sum of the outputs.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input capacity cells to the transaction.
	if(outputCapacity - recycleCapacity + ckbytesToShannons(61n) > 0) // Only add if there isn't enough recycled capacity.
	{
		const collectedCells = await collectCapacity(indexer, addressToScript(address1), outputCapacity - recycleCapacity + ckbytesToShannons(61n));
		transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));
		addressUsed1 = true;
	}

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	// describeTransaction(transaction.toJS());

	// Sign the transaction.
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signatures = [];
	const signingEntries = transaction.get("signingEntries").toArray();
	if(addressUsed1 && !addressUsed2)
	{
		const signature = signMessage(privateKey1, signingEntries[0].message);
		signatures.push(signature);
	}
	else if(addressUsed2 && !addressUsed1)
	{
		const signature = signMessage(privateKey2, signingEntries[0].message);
		signatures.push(signature);
	}
	else
	{
		const signature2 = signMessage(privateKey2, signingEntries[0].message);
		signatures.push(signature2);
		const signature1 = signMessage(privateKey1, signingEntries[1].message);
		signatures.push(signature1);
	}
	const signedTx = sealTransaction(transaction, signatures);

	// Send the transaction to the RPC node.
	// process.stdout.write("Setup Transaction Sent: ");
	const txid = await sendTransaction(nodeUrl, signedTx);
	// process.stdout.write(txid);
	// console.log();
	// console.log();

	// Wait for the transaction to confirm.
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(nodeUrl, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	console.log("\n");
}

function signTransaction(transaction, privateKey)
{
	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	return lab.signTransaction(transaction, privateKey);
}

async function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	const dataFile1 = "../files/HelloWorld.txt";
	const dataFile2 = "../files/LoremIpsum.txt";

	if(tx.inputs.length < 2)
		throw new Error("This lab requires at least two input cells.");

	if(tx.outputs.length != 3)
		throw new Error("This lab requires three output cells.");

	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(dataFile1);

	if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(dataSize1) + ckbytesToShannons(61n))
		throw new Error(`This lab requires output 0 to have a capacity of ${dataSize1} CKBytes.`)

	if(tx.outputs[0].data !== hexString1)
		throw new Error("Output 0 must have data matching the content of HelloWorld.txt.");

	const {hexString: hexString2, dataSize: dataSize2} = await readFileToHexString(dataFile2);

	if(hexToInt(tx.outputs[1].cell_output.capacity) != ckbytesToShannons(dataSize2) + ckbytesToShannons(61n))
		throw new Error(`This lab requires output 1 to have a capacity of ${dataSize2} CKBytes.`)

	if(tx.outputs[1].data !== hexString2)
		throw new Error("Output 1 must have data matching the content of LoremIpsum.txt.");

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const txFee = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(txFee > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(txFee)} Shannons.`);

	if(txFee != 100_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

module.exports =
{
	describeTransaction,
	getLiveCell,
	initializeLab,
	signTransaction,
	validateLab
};
