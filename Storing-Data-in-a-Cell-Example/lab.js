"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const lib = require("../lib/index.js");
const {addDefaultWitnessPlaceholders, ckbytesToShannons, collectCapacity, getLiveCell, hexToInt, intToHex, indexerReady, sendTransaction, signMessage, waitForTransactionConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {addInput, addInputs, addOutput, initializeLumosIndexer, signTransaction} = require("../lib/lab.js");

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showInputs: true,
		showOutputs: true,
		showWitnesses: false
	};

	return lib.describeTransaction(transaction, options);
}

async function initializeLumosSkeleton(indexer)
{
	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	return skeleton;
}

async function initializeLab(nodeUrl)
{
	// Create indexer.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Initialize a tx skeleton.
	const transaction = await initializeLumosSkeleton(indexer);

	return {indexer, transaction};
}

function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	// if(tx.inputs.length < 3)
	// 	throw new Error("This lab requires at least three input Cells.");

	// if(tx.outputs.length != 2)
	// 	throw new Error("This lab requires two output Cells.");

	// if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(100n))
	// 	throw new Error("This lab requires output 0 to have a capacity of 100 CKBytes.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+BigInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+BigInt(c.cell_output.capacity), 0n);
	const txFee = inputCapacity - outputCapacity;

	if(txFee > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(txFee)} Shannons.`);

	// if(txFee != 100_000n)
	// 	throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");
}

module.exports =
{
	addInput,
	addInputs,
	addOutput,
	describeTransaction,
	getLiveCell,
	initializeLab,
	signTransaction,
	validateLab
};
