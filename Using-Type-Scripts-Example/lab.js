"use strict";

import {utils} from "@ckb-lumos/base";
const {ckbHash} = utils;
import {addressToScript} from "@ckb-lumos/helpers";
import {TransactionSkeleton} from "@ckb-lumos/helpers";
import {CellCollector} from "@ckb-lumos/ckb-indexer";
import {secp256k1Blake160} from "@ckb-lumos/common-scripts";
import {sealTransaction} from "@ckb-lumos/helpers";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, describeTransaction as libDescribeTransaction, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signMessage, signTransaction, waitForConfirmation, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} from "../lib/util.js";

// Always success binary.
const DATA_FILE_1 = "../files/always_success";
const DATA_FILE_HASH_1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(DATA_FILE_1).hexString)); // Blake2b hash of the always success binary.

// Genesis account.
const PRIVATE_KEY_1 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga";	

// Account to fund.
const PRIVATE_KEY_2 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_2 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// Transaction Fee
const TX_FEE = 100_000n;

export function describeTransaction(transaction)
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

export async function initializeLab(NODE_URL, indexer)
{
	// Create a cell that contains the always_success binary.
	const alwaysSuccessCodeOutPoint = await deployAlwaysSuccessBinary(NODE_URL, indexer);
	await indexerReady(indexer);

	// Setup the Cells for the lab.
	await setupCells(NODE_URL, indexer, alwaysSuccessCodeOutPoint);
	await indexerReady(indexer);
}

async function deployAlwaysSuccessBinary(NODE_URL, indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(DATA_FILE_1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cellOutput: {capacity: intToHex(outputCapacity1), lock: addressToScript(ADDRESS_2), type: null}, data: hexString1};
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
	// describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	// console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	// console.log("\n");

	// Return the out point for the always success binary so it can be used in the next transaction.
	const outPoint =
	{
		txHash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function setupCells(NODE_URL, indexer, alwaysSuccessCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Add the cell dep for the always success lock.
	const cellDep = {depType: "code", outPoint: alwaysSuccessCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Flags to track which addresses were used.
	let addressUsed1 = false;
	let addressUsed2 = false;

	// Recycle all existing cells to inputs.
	let recycleCells = [];
	const query1 = {lock: addressToScript(ADDRESS_2), type: null};
	const cellCollector1 = new CellCollector(indexer, query1);
	for await (const cell of cellCollector1.collect())
		recycleCells.push(cell);
	const query2 = {lock: addressToScript(ADDRESS_2), type: {codeHash: DATA_FILE_HASH_1, hashType: "data1", args: "0x"}};
	const cellCollector2 = new CellCollector(indexer, query2);
	for await (const cell of cellCollector2.collect())
		recycleCells.push(cell);
	if(recycleCells.length > 0)
		addressUsed2 = true;
	transaction = transaction.update("inputs", (i)=>i.concat(recycleCells));

	// Determine the capacity from recycled Cells.
	const recycleCapacity = recycleCells.reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create cells for the funding address.
	for(let i = 0; i < 10; i++)
	{
		const outputCapacity1 = intToHex(ckbytesToShannons(10_000n));
		const output1 = {cellOutput: {capacity: outputCapacity1, lock: addressToScript(ADDRESS_2), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output1));
	}

	// Get the sum of the outputs.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Add input capacity cells to the transaction.
	if(outputCapacity - recycleCapacity + ckbytesToShannons(61n) > 0) // Only add if there isn't enough recycled capacity.
	{
		const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacity - recycleCapacity + ckbytesToShannons(61n));
		transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));
		addressUsed1 = true;
	}

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cellOutput: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
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
	// process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	await indexerReady(indexer, (_indexerTip, _rpcTip)=>process.stdout.write("."));
	console.log("\n");
}

export async function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	// if(tx.inputs.length < 3)
	// 	throw new Error("This lab requires at least three input cells.");

	// if(tx.outputs.length != 2)
	// 	throw new Error("This lab requires two output cells.");

	// if(hexToInt(tx.outputs[0].cellOutput.capacity) != ckbytesToShannons(100n))
	// 	throw new Error("This lab requires output 0 to have a capacity of 100 CKBytes.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);

	// if(TX_FEE != 100_000n)
	// 	throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

export default {
	describeTransaction,
	getLiveCell,
	initializeLab,
	validateLab
};
