"use strict";

import {addressToScript} from "@ckb-lumos/helpers";
import {locateCellDep, TransactionSkeleton} from "@ckb-lumos/helpers";
import {CellCollector} from "@ckb-lumos/ckb-indexer";
import {secp256k1Blake160} from "@ckb-lumos/common-scripts";
import {sealTransaction} from "@ckb-lumos/helpers";
import {addDefaultWitnessPlaceholders, collectCapacity, describeTransaction as libDescribeTransaction, getLiveCell, indexerReady, sendTransaction, signMessage, waitForConfirmation, DEFAULT_LOCK_HASH} from "../lib/index.js";
import {ckbytesToShannons, hexToInt, intToHex} from "../lib/util.js";

export function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: true,
		showInputs: true,
		showInputType: true,
		showInputData: false,
		showOutputs: true,
		showOutputType: true,
		showOutputData: false,
		showWitnesses: false
	};

	return libDescribeTransaction(transaction, options);
}

async function initializeLumosSkeleton(indexer)
{
	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton();

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({codeHash: DEFAULT_LOCK_HASH, hashType: "type"})));

	return skeleton;
}

export async function initializeLab(NODE_URL, indexer)
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

	// Determine the capacity from recycled cells.
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
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	await indexerReady(indexer, (_indexerTip, _rpcTip)=>process.stdout.write("."));
	console.log("\n");
}

export function signTransaction(transaction, PRIVATE_KEY)
{
	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	return lab.signTransaction(transaction, PRIVATE_KEY);
}

export async function validateLab(skeleton, action)
{
	if(action == "deploy")
		return;
	else if(action == "create")
		await validateLabCreate(skeleton);
	else if(action == "consume")
		await validateLabConsume(skeleton);
	else
		throw new Error("Invalid action specified");
}

async function validateLabCreate(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length < 1)
		throw new Error("This lab requires at least one input cell.");

	if(tx.outputs.length != 4)
		throw new Error("This lab requires four output cells.");

	for(let i = 0; i < 3; ++i)
	{
		if(hexToInt(tx.outputs[i].cellOutput.capacity) != ckbytesToShannons(41n))
			throw new Error(`This lab requires output ${i} to have a capacity of 41 CKBytes.`);
	}

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);

	if(TX_FEE != 100_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

async function validateLabConsume(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length < 3)
		throw new Error("This lab requires at least three input cells.");

	if(tx.outputs.length != 1)
		throw new Error("This lab requires one output cell.");

	for(let i = 0; i < 3; ++i)
	{
		if(hexToInt(tx.inputs[i].cellOutput.capacity) != ckbytesToShannons(41n))
			throw new Error(`This lab requires input ${i} to have a capacity of 41 CKBytes.`);
	}

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);

	if(TX_FEE != 100_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

export default {
	describeTransaction,
	getLiveCell,
	initializeLab,
	signTransaction,
	validateLab
};
