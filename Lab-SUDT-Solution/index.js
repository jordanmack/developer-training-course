"use strict";

const {utils} = require("@ckb-lumos/base");
const {ckbHash, computeScriptHash} = utils;
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, indexerReady, initializeLumosIndexer, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex, intToU128LeHexBytes, u128LeHexBytesToInt} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// These are the private keys and addresses that will be used in this exercise.
const ALICE_PRIVATE_KEY = "0x81dabf8f74553c07999e1400a8ecc4abc44ef81c9466e6037bd36e4ad1631c17";
const ALICE_ADDRESS = "ckt1qyq2a6ymy7fjntsc2q0jajnmljt690g4xpdsyw4k5f";
const BOB_ADDRESS = "ckt1qyq9gstman8qyjv0ucwqnw0h6z5cn6z9xxlssmqc92";
const CHARLIE_ADDRESS = "ckt1qyq9sz6wanl8v3tdmq6as38yq3j9hwg637kqu3e2xn";
const DANIEL_ADDRESS = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the RISC-V binary.
const dataFile1 = "../files/sudt";
const dataFileHash1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(dataFile1).hexString)).serializeJson(); // Blake2b hash of the RISC-V binary.

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function deployCode(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(dataFile1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: addressToScript(ALICE_ADDRESS), type: null}, data: hexString1};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(ALICE_ADDRESS), outputCapacity1 + ckbytesToShannons(61n) + txFee);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ALICE_ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction, "deploy");

	// Sign the transaction.
	const signedTx = signTransaction(transaction, ALICE_PRIVATE_KEY);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	// Return the out point for the binary so it can be used in the next transaction.
	const outPoint =
	{
		tx_hash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCells(indexer, scriptCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell deps.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {dep_type: "code", out_point: scriptCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Create a token cells.
	for(const addressTokenPair of [[ALICE_ADDRESS, 100n], [ALICE_ADDRESS, 300n], [ALICE_ADDRESS, 700n], [DANIEL_ADDRESS, 900n]])
	{
		const outputCapacity1 = ckbytesToShannons(142n);
		const lockScript1 = addressToScript(addressTokenPair[0]);
		const lockScriptHashAlice = computeScriptHash(addressToScript(ALICE_ADDRESS));
		const typeScript1 =
		{
			code_hash: dataFileHash1,
			hash_type: "data",
			args: lockScriptHashAlice
		};
		const data1 = intToU128LeHexBytes(addressTokenPair[1]);
		const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1}, data: data1};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Determine the capacity from all output Cells.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	
	// Add input capacity cells.
	const capacityRequired = outputCapacity + ckbytesToShannons(61n) + txFee;
	const collectedCells = await collectCapacity(indexer, addressToScript(ALICE_ADDRESS), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ALICE_ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction, "create");

	// Sign the transaction.
	const signedTx = signTransaction(transaction, ALICE_PRIVATE_KEY);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");
}

async function transferCells(indexer, scriptCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell deps.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {dep_type: "code", out_point: scriptCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add Alice's token cells to the transaction.
	const lockScriptHashAlice = computeScriptHash(addressToScript(ALICE_ADDRESS));
	const typeScript1 =
	{
		code_hash: dataFileHash1,
		hash_type: "data",
		args: lockScriptHashAlice
	};
	const query = {lock: addressToScript(ALICE_ADDRESS), type: typeScript1};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
		transaction = transaction.update("inputs", (i)=>i.push(cell));

	// Add output token cells.
	for(const addressTokenPair of [[BOB_ADDRESS, 200n], [CHARLIE_ADDRESS, 500n]])
	{
		const outputCapacity1 = ckbytesToShannons(142n);
		const lockScript1 = addressToScript(addressTokenPair[0]);
		const lockScriptHashAlice = computeScriptHash(addressToScript(ALICE_ADDRESS));
		const typeScript1 =
		{
			code_hash: dataFileHash1,
			hash_type: "data",
			args: lockScriptHashAlice
		};
		const data1 = intToU128LeHexBytes(addressTokenPair[1]);
		const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1}, data: data1};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Determine the tokens from all input cells.
	const inputTokens = transaction.inputs.toArray().reduce((a, c)=>a+u128LeHexBytesToInt(c.data), 0n);
	const outputTokens = transaction.outputs.toArray().reduce((a, c)=>a+u128LeHexBytesToInt(c.data), 0n);

	// Create a token change cell.
	const tokenChange = inputTokens - outputTokens;
	const change1 = {cell_output: {capacity: intToHex(ckbytesToShannons(142n)), lock: addressToScript(ALICE_ADDRESS), type: typeScript1}, data: intToU128LeHexBytes(tokenChange)};
	transaction = transaction.update("outputs", (i)=>i.push(change1));

	// Determine the capacity for the output cells.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input capacity cells.
	const capacityRequired = outputCapacity + ckbytesToShannons(61n) + txFee;
	const collectedCells = await collectCapacity(indexer, addressToScript(ALICE_ADDRESS), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity from input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	const change2 = {cell_output: {capacity: changeCapacity, lock: addressToScript(ALICE_ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change2));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction, "transfer");

	// Sign the transaction.
	const signedTx = signTransaction(transaction, ALICE_PRIVATE_KEY);

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

	while(true)
	{

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);
	await indexerReady(indexer);

	// Create a cell that contains the script code binary.
	const scriptCodeOutPoint = await deployCode(indexer);
	await indexerReady(indexer);

	// Create cells that uses the binary that was just deployed.
	await createCells(indexer, scriptCodeOutPoint);
	await indexerReady(indexer);

	// Transfer the cells created in the last transaction.
	await transferCells(indexer, scriptCodeOutPoint);
	await indexerReady(indexer);

	}

	console.log("Exercise completed successfully!");
}
main();
