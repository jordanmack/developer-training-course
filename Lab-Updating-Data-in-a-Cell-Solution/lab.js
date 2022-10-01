"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/ckb-indexer");
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
	let skeleton = TransactionSkeleton();

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	return skeleton;
}

async function initializeLab(NODE_URL, indexer)
{
	// Setup the Cells for the lab.
	await setupCells(NODE_URL, indexer);
	await indexerReady(indexer);

	// Initialize a tx skeleton.
	const transaction = await initializeLumosSkeleton(indexer);

	return {transaction};
}

async function setupCells(NODE_URL, indexer)
{
	// Genesis account.
	const PRIVATE_KEY_1 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
	const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga";	

	// Account to fund.
	const PRIVATE_KEY_2 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
	const ADDRESS_2 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

	// Contents for Cell data.
	const DATA_FILE_1 = "../files/HelloNervos.txt";

	// Transaction Fee
	const TX_FEE = 100_000n;

	// Initialize a Lumos instance.
	let transaction = await initializeLumosSkeleton(indexer);

	// Flags to track which addresses were used.
	let addressUsed1 = false;
	let addressUsed2 = false;

	// Recycle all existing cells to inputs.
	const query = {lock: addressToScript(ADDRESS_2), type: "empty"};
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
		// const outputCapacity = intToHex(ckbytesToShannons(61n));
		const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(ADDRESS_2), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output));	
		outputCapacityTotal += hexToInt(outputCapacity);
	}

	// Create a cell for funding address with specific data.
	for(let i = 0; i < 2; i++)
	{
		const {hexString} = await readFileToHexString(DATA_FILE_1);
		const outputCapacity1 = intToHex(ckbytesToShannons(74n));
		// const outputCapacity1 = intToHex(109700050000n);
		// const outputCapacity1 = intToHex(ckbytesToShannons(getRandomInt(74, 2000)));
		const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(ADDRESS_2), type: null}, data: hexString};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Get the sum of the outputs.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input capacity cells to the transaction.
	if(outputCapacity - recycleCapacity + ckbytesToShannons(61n) > 0) // Only add if there isn't enough recycled capacity.
	{
		const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacity - recycleCapacity + ckbytesToShannons(61n));
		transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));
		addressUsed1 = true;
	}

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
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
		const signature = signMessage(PRIVATE_KEY_1, signingEntries[0].message);
		signatures.push(signature);
	}
	else if(addressUsed2 && !addressUsed1)
	{
		const signature = signMessage(PRIVATE_KEY_2, signingEntries[0].message);
		signatures.push(signature);
	}
	else
	{
		const signature2 = signMessage(PRIVATE_KEY_2, signingEntries[0].message);
		signatures.push(signature2);
		const signature1 = signMessage(PRIVATE_KEY_1, signingEntries[1].message);
		signatures.push(signature1);
	}
	const signedTx = sealTransaction(transaction, signatures);

	// Send the transaction to the RPC node.
	// process.stdout.write("Setup Transaction Sent: ");
	const txid = await sendTransaction(NODE_URL, signedTx);
	// process.stdout.write(txid);
	// console.log();
	// console.log();

	// Wait for the transaction to confirm.
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	await indexerReady(indexer, (_indexerTip, _rpcTip)=>process.stdout.write("."));
	console.log("\n");
}

function signTransaction(transaction, PRIVATE_KEY)
{
	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	return lab.signTransaction(transaction, PRIVATE_KEY);
}

async function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	const DATA_FILE_1 = "../files/HelloWorld.txt";
	const DATA_FILE_2 = "../files/LoremIpsum.txt";

	if(tx.inputs.length < 2)
		throw new Error("This lab requires at least two input cells.");

	if(tx.outputs.length != 3)
		throw new Error("This lab requires three output cells.");

	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(DATA_FILE_1);

	if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(dataSize1) + ckbytesToShannons(61n))
		throw new Error(`This lab requires output 0 to have a capacity of ${dataSize1} CKBytes.`)

	if(tx.outputs[0].data !== hexString1)
		throw new Error("Output 0 must have data matching the content of HelloWorld.txt.");

	const {hexString: hexString2, dataSize: dataSize2} = await readFileToHexString(DATA_FILE_2);

	if(hexToInt(tx.outputs[1].cell_output.capacity) != ckbytesToShannons(dataSize2) + ckbytesToShannons(61n))
		throw new Error(`This lab requires output 1 to have a capacity of ${dataSize2} CKBytes.`)

	if(tx.outputs[1].data !== hexString2)
		throw new Error("Output 1 must have data matching the content of LoremIpsum.txt.");

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);

	if(TX_FEE != 100_000n)
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
