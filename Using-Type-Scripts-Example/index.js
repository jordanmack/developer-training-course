"use strict";

const {utils} = require("@ckb-lumos/base");
const {ckbHash} = utils;
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, indexerReady, initializeLumosIndexer, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const lockArg1 = "0x988a9c3e74c09dab76c8e41d481a71f4d36d772f";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the always success RISC-V binary.
const dataFile1 = "../files/always_success";
const dataFileHash1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(dataFile1).hexString)).serializeJson(); // Blake2b hash of the always success binary.

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function deployAlwaysSuccessBinary(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(dataFile1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: addressToScript(address1), type: null}, data: hexString1};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(address1), outputCapacity1 + ckbytesToShannons(61n) + txFee);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	// Return the out point for the always success binary so it can be used in the next transaction.
	const outPoint =
	{
		tx_hash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCellWithAlwaysSuccessTypeScript(indexer, alwaysSuccessCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell deps for the lock script and type script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {dep_type: "code", out_point: alwaysSuccessCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Create cells using the always success type script.
	const outputCapacity1 = ckbytesToShannons(94n);
	const lockScript1 =
	{
		code_hash: DEFAULT_LOCK_HASH,
		hash_type: "type",
		args: lockArg1
	};
	const typeScript1 =
	{
		code_hash: dataFileHash1,
		hash_type: "data",
		args: "0x"
	};
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1, output1, output1));

	// Add input capacity cells.
	const capacityRequired = outputCapacity1 + ckbytesToShannons(61n) + txFee;
	const collectedCells = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");
}

async function consumeCellWithAlwaysSuccessTypeScript(indexer, alwaysSuccessCodeOutPoint, alwaysSuccessCellOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell deps for the lock script and type script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {dep_type: "code", out_point: alwaysSuccessCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add the always success cell to the transaction.
	const lockScript1 = addressToScript(address1);
	const typeScript1 =
	{
		code_hash: dataFileHash1,
		hash_type: "data",
		args: "0x"
	};
	const query = {lock: lockScript1, type: typeScript1};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
		transaction = transaction.update("inputs", (i)=>i.push(cell));

	// Add input capacity cells.
	// const capacityRequired = ckbytesToShannons(61n) + txFee;
	// const collectedCells = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
	// transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);
	await indexerReady(indexer);

	// Create a cell that contains the always_success binary.
	const alwaysSuccessCodeOutPoint = await deployAlwaysSuccessBinary(indexer);
	await indexerReady(indexer);

	// Create a cell that uses the always success binary that was just deployed.
	const alwaysSuccessCellOutPoint = await createCellWithAlwaysSuccessTypeScript(indexer, alwaysSuccessCodeOutPoint);
	await indexerReady(indexer);

	// Consume the cell locked with the always success lock.
	await consumeCellWithAlwaysSuccessTypeScript(indexer, alwaysSuccessCodeOutPoint, alwaysSuccessCellOutPoint);
	await indexerReady(indexer);

	console.log("Example completed successfully!");
}
main();
