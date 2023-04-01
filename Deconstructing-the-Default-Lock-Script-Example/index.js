"use strict";

import fs from "fs";
import {initializeConfig} from "@ckb-lumos/config-manager";
import {addressToScript, TransactionSkeleton} from "@ckb-lumos/helpers";
import {Indexer} from "@ckb-lumos/ckb-indexer";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, sendTransaction, signTransaction, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, hexToInt, intToHex} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key, lock arg, and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const lockArg1 = "0x988a9c3e74c09dab76c8e41d481a71f4d36d772f";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function createDefaultLockCells(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell using the default lock script.
	const outputCapacity1 = intToHex(ckbytesToShannons(61n));
	const output1 = {cellOutput: {capacity: outputCapacity1, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Create a cell using the default lock script, but expanded this time.
	const outputCapacity2 = intToHex(ckbytesToShannons(61n));
	const lockScript2 =
	{
		codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
		hashType: "type",
		args: lockArg1
	}
	const output2 = {cellOutput: {capacity: outputCapacity2, lock: lockScript2, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));

	// Get the capacity sum of the outputs.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Add capacity to the transaction.
	const capacityRequired = outputCapacity + ckbytesToShannons(61n) + TX_FEE;
	const {inputCells} = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(inputCells));

	// Get the capacity sum of the inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change cell for the remaining CKBytes.
	const outputCapacity3 = intToHex(inputCapacity - outputCapacity - TX_FEE);
	const output3 = {cellOutput: {capacity: outputCapacity3, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output3));

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

	// Return the out points for outputs 1-3.
	const defaultLockCellOutPoints =
	[
		{txHash: txid, index: "0x0"},
		{txHash: txid, index: "0x1"},
		{txHash: txid, index: "0x2"}
	];

	return defaultLockCellOutPoints;
}

async function consumeDefaultLockCells(indexer, defaultLockCellOutPoints)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Get a live cell for each out point and add to the transaction.
	for(const outPoint of defaultLockCellOutPoints)
	{
		const input = await getLiveCell(NODE_URL, outPoint);
		transaction = transaction.update("inputs", (i)=>i.push(input));	
	}

	// Get the capacity sum of the inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - TX_FEE);
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

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create some cells using the default lock script.
	const defaultLockCellOutPoints = await createDefaultLockCells(indexer);
	await indexerReady(indexer);

	// Consume the cells we just created with the default lock script.
	await consumeDefaultLockCells(indexer, defaultLockCellOutPoints);
	await indexerReady(indexer);	

	console.log("Example completed successfully!");
}
main();
