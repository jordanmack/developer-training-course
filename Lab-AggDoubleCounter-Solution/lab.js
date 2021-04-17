"use strict";

const {values} = require("@ckb-lumos/base");
const {ScriptValue} = values;
const {addressToScript} = require("@ckb-lumos/helpers");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultWitnessPlaceholders, collectCapacity, describeTransaction: libDescribeTransaction, getLiveCell, sendTransaction, signMessage, waitForConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: true,
		showInputs: true,
		showInputType: true,
		showInputData: true,
		showOutputs: true,
		showOutputType: true,
		showOutputData: true,
		showWitnesses: false
	};

	return libDescribeTransaction(transaction, options);
}

async function initializeLab(nodeUrl, indexer)
{
	// Setup the Cells for the lab.
	await setupCells(nodeUrl, indexer);
}

async function setupCells(nodeUrl, indexer)
{
	// Genesis account.
	const privateKey1 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
	const address1 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";	

	// Account to fund.
	const privateKey2 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
	const address2 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

	// Transaction Fee
	const txFee = 100_000n;

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

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
	for(let i = 0; i < 10; i++)
	{
		const outputCapacity1 = intToHex(ckbytesToShannons(100_000n));
		const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address2), type: null}, data: "0x"};
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

async function validateLab(skeleton, action)
{
	if(action == "deploy")
		return;
	else if(action == "create")
		await validateLabCreate(skeleton);
	else if(action == "update")
		await validateLabUpdate(skeleton);
	else
		throw new Error("Invalid action specified");
}

async function validateLabCreate(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length !== 1)
		throw new Error("This lab requires one input cell.");

	if(tx.outputs.length !== 4)
		throw new Error("This lab requires four output cells.");

	for(let i = 0; i < 3; i++)
	{
		if(new ScriptValue(tx.outputs[i].cell_output.lock).hash() !== "0x6ee8b1ea3db94183c5e5a47fbe82110101f6f8d3e18d1ecd4d6a5425e648da69")
			throw new Error(`This lab requires output ${i} to use the default lock script with address1.`);

		const capacity = 110n;
		if(BigInt(tx.outputs[i].cell_output.capacity) !== ckbytesToShannons(capacity))
			throw new Error(`This lab requires output ${i} to have a capacity of ${capacity} CKBytes.`);

		const data = ["0x00000000000000000000000000000000", "0x2a000000000000002a00000000000000", "0x28230000000000002823000000000000"];
		if(tx.outputs[i].data !== data[i])
			throw new Error(`This lab requires output ${i} to have a data value of "${data[i]}".`);
	}

	// if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(100n))
	// 	throw new Error("This lab requires output 0 to have a capacity of 100 CKBytes.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const txFee = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(txFee > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(txFee)} Shannons.`);

	// if(txFee != 100_000n)
	// 	throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

async function validateLabUpdate(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length !== 4)
		throw new Error("This lab requires four input cells.");

	if(tx.outputs.length !== 4)
		throw new Error("This lab requires four output cells.");

	for(let i = 0; i < 3; i++)
	{
		if(new ScriptValue(tx.inputs[i].cell_output.lock).hash() !== "0x6ee8b1ea3db94183c5e5a47fbe82110101f6f8d3e18d1ecd4d6a5425e648da69")
			throw new Error(`This lab requires input ${i} to use the default lock script with address1.`);

		const capacity = 110n;
		if(BigInt(tx.inputs[i].cell_output.capacity) !== ckbytesToShannons(capacity))
			throw new Error(`This lab requires input ${i} to have a capacity of ${capacity} CKBytes.`);	

		const data = ["0x00000000000000000000000000000000", "0x2a000000000000002a00000000000000", "0x28230000000000002823000000000000"];
		if(tx.inputs[i].data !== data[i])
			throw new Error(`This lab requires input ${i} to have a data value of "${data[i]}".`);
	}

	for(let i = 0; i < 3; i++)
	{
		if(new ScriptValue(tx.outputs[i].cell_output.lock).hash() !== "0x6ee8b1ea3db94183c5e5a47fbe82110101f6f8d3e18d1ecd4d6a5425e648da69")
			throw new Error(`This lab requires output ${i} to use the default lock script with address1.`);

		const data = ["0x01000000000000000200000000000000", "0x2b000000000000002c00000000000000", "0x29230000000000002a23000000000000"];
		if(tx.outputs[i].data !== data[i])
			throw new Error(`This lab requires output ${i} to have a data value of "${data[i]}".`);
	}

	// if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(100n))
	// 	throw new Error("This lab requires output 0 to have a capacity of 100 CKBytes.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const txFee = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(txFee > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(txFee)} Shannons.`);

	// if(txFee != 100_000n)
	// 	throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

module.exports =
{
	describeTransaction,
	getLiveCell,
	initializeLab,
	signTransaction,
	validateLab
};
