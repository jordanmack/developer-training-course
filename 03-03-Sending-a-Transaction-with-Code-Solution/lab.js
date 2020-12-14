"use strict";

const {core} = require("@ckb-lumos/base");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {Indexer} = require("@ckb-lumos/indexer");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {normalizers, Reader} = require("ckb-js-toolkit");
const lib = require("../lib/index.js");
const {ckbytesToShannons, getLiveCell, indexerReady, DEFAULT_LOCK_HASH, SECP_SIGNATURE_PLACEHOLDER} = lib;
const lab = require("../lib/lab.js");
const {addInput, addOutput, sendTransaction, signTransaction} = lab;
const _ = require("lodash");

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

async function initializeLab(nodeUrl, privateKey)
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = new Indexer(nodeUrl, "../indexer-data");
	indexer.start();
	await indexerReady(indexer, (indexerTip, rpcTip)=>console.log(`Indexer Progress: ${Math.floor(Number(indexerTip)/Number(rpcTip)*100)}%`), 0, 1000);
	console.log();

	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	// Add in a placeholder witness which we will sign below.
	const witness = new Reader(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: SECP_SIGNATURE_PLACEHOLDER}))).serializeJson();
	skeleton = skeleton.update("witnesses", (w)=>w.push(witness));

	return {indexer, transaction: skeleton};
}

function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length != 1)
		throw new Error("This lab requires a single input Cell.");

	if(tx.outputs.length != 2)
		throw new Error("This lab requires two output Cells.");

	if(BigInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(1_000n))
		throw new Error("This lab requires output 0 to have a capacity of 1,000 CKBytes.")

	let outputCapacity = 0n;
	for(let output of tx.outputs)
		outputCapacity += BigInt(output.cell_output.capacity);

	const txFee = BigInt(tx.inputs[0].cell_output.capacity) - outputCapacity;

	if(txFee > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(txFee)} Shannons.`);

	if(txFee != 10_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.0001 CKBytes.");
}

module.exports =
{
	addInput,
	addOutput,
	describeTransaction,
	getLiveCell,
	initializeLab,
	sendTransaction,
	signTransaction,
	validateLab
};
