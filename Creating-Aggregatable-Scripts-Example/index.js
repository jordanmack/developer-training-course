"use strict";

import fs from "fs";
import {utils} from "@ckb-lumos/base";
const {ckbHash} = utils;
import {initializeConfig} from "@ckb-lumos/config-manager";
import {addressToScript, TransactionSkeleton} from "@ckb-lumos/helpers";
import {Indexer} from "@ckb-lumos/ckb-indexer";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex, intToU64LeHexBytes, u64LeHexBytesToInt} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the Aggregatable Counter RISC-V binary.
const DATA_FILE_1 = "../files/aggcounter";
const DATA_FILE_HASH_1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(DATA_FILE_1).hexString)); // Blake2b hash of the Aggregatable Counter binary.

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function deployCode(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(DATA_FILE_1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cellOutput: {capacity: intToHex(outputCapacity1), lock: addressToScript(ADDRESS_1), type: null}, data: hexString1};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacity1 + ckbytesToShannons(61n) + TX_FEE);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cellOutput: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	// Return the out point for the Aggregatable Counter binary so it can be used in the next transaction.
	const outPoint =
	{
		txHash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCells(indexer, aggCounterCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell deps for the default lock script and Aggregatable Counter type script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {depType: "code", outPoint: aggCounterCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Create cells using the Aggregatable Counter type script.
	for(const amount of [0n, 42n, 9_000n])
	{
		const outputCapacity1 = ckbytesToShannons(102n);
		const lockScript1 = addressToScript(ADDRESS_1);
		const typeScript1 =
		{
			codeHash: DATA_FILE_HASH_1,
			hashType: "data1",
			args: "0x"
		};
		const data1 = intToU64LeHexBytes(amount);
		const output1 = {cellOutput: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1}, data: data1};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Determine the capacity from all output Cells.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	
	// Add input capacity cells.
	const capacityRequired = outputCapacity + ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cellOutput: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	// Return the out point of the Aggregatable Counter cell so it can be used in the next transaction.
	const outPoints =
	[
		{txHash: txid, index: "0x0"},
		{txHash: txid, index: "0x1"},
		{txHash: txid, index: "0x2"}
	];

	return outPoints;
}

async function updateCells(indexer, aggCounterCodeOutPoint, counterCellOutPoints)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell deps for the default lock script and Aggregatable Counter type script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {depType: "code", outPoint: aggCounterCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add the Aggregatable Counter cells to the transaction and keep track of their counter values.
	const counterValues = [];
	for(const counterCellOutPoint of counterCellOutPoints)
	{
		const input = await getLiveCell(NODE_URL, counterCellOutPoint, true);
		counterValues.push(u64LeHexBytesToInt(input.data));
		transaction = transaction.update("inputs", (i)=>i.push(input));
	}

	// Add the updated Aggregatable Counter cell to the transaction.
	for(const counterValue of counterValues)
	{
		const outputCapacity1 = ckbytesToShannons(102n);
		const lockScript1 = addressToScript(ADDRESS_1);
		const typeScript1 =
		{
			codeHash: DATA_FILE_HASH_1,
			hashType: "data1",
			args: "0x"
		};
		const dataValue1 = counterValue + 1n;
		const data1 = intToU64LeHexBytes(dataValue1);
		const output1 = {cellOutput: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1}, data: data1};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Determine the capacity for the output cells.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Add input capacity cells.
	const capacityRequired = outputCapacity + ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity from input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	const change = {cellOutput: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a cell that contains the Aggregatable Counter binary.
	const aggCounterCodeOutPoint = await deployCode(indexer);
	await indexerReady(indexer);

	// Create cells that uses the Aggregatable Counter binary that was just deployed.
	const counterCellOutPoints = await createCells(indexer, aggCounterCodeOutPoint);
	await indexerReady(indexer);

	// Consume the cells locked with the Aggregatable Counter.
	await updateCells(indexer, aggCounterCodeOutPoint, counterCellOutPoints);
	await indexerReady(indexer);

	console.log("Example completed successfully!");
}
main();
