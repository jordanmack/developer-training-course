"use strict";

import fs from "fs";
import {utils} from "@ckb-lumos/base";
const {ckbHash} = utils;
import {initializeConfig} from "@ckb-lumos/config-manager";
import {addressToScript, sealTransaction, TransactionSkeleton} from "@ckb-lumos/helpers";
import {Indexer} from "@ckb-lumos/ckb-indexer";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the "CKB 500" RISC-V binary which requires an exactly 500 CKByte input capacity.
const DATA_FILE_1 = "../files/ckb500";
const DATA_FILE_HASH_1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(DATA_FILE_1).hexString)); // Blake2b hash of the CKB 500 binary.

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function deployCkb500Binary(indexer)
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

	// Return the out point for the CKB 500 binary so it can be used in the next transaction.
	const outPoint =
	{
		txHash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCellsWithCkb500Lock(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create cells using the CKB 500 lock.
	const outputCapacity1 = ckbytesToShannons(250n);
	const lockScript1 =
	{
		codeHash: DATA_FILE_HASH_1,
		hashType: "data1",
		args: "0x"
	}
	const output1 = {cellOutput: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.concat([output1, output1]));

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
}

async function consumeCellsWithCkb500Lock(indexer, ckb500CodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	const cellDep = {depType: "code", outPoint: ckb500CodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add the CKB 500 cells to the transaction. 
	const capacityRequired = ckbytesToShannons(500n);
	const lockScript1 =
	{
		codeHash: DATA_FILE_HASH_1,
		hashType: "data1",
		args: "0x"
	};
	const collectedCells = await collectCapacity(indexer, lockScript1, capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cellOutput: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	// transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	// const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Seal the transaction.
	const signedTx = sealTransaction(transaction, []);

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

	// Create a cell that contains the CKB 500 binary.
	const ckb500CodeOutPoint = await deployCkb500Binary(indexer);
	await indexerReady(indexer);

	// Create cells that uses the CKB 500 binary that was just deployed.
	await createCellsWithCkb500Lock(indexer);
	await indexerReady(indexer);

	// Consume the cells locked with the CKB 500 lock.
	await consumeCellsWithCkb500Lock(indexer, ckb500CodeOutPoint);
	await indexerReady(indexer);

	console.log("Example completed successfully!");
}
main();
