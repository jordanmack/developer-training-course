"use strict";

const {core} = require("@ckb-lumos/base");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {normalizers, Reader} = require("ckb-js-toolkit");
const lib = require("../lib/index.js");
const {ckbytesToShannons, getLiveCell, hexToInt, DEFAULT_LOCK_HASH, SECP_SIGNATURE_PLACEHOLDER} = require("../lib/index.js");
const {addInput, addOutput, initializeLumosIndexer, signTransaction} = require("../lib/lab.js");

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

async function initializeLab(nodeUrl)
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	// Add in a placeholder witness which we will be signed later.
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

	if(hexToInt(tx.outputs[0].cell_output.capacity) != ckbytesToShannons(1_000n))
		throw new Error("This lab requires output 0 to have a capacity of 1,000 CKBytes.")

	let outputCapacity = 0n;
	for(let output of tx.outputs)
		outputCapacity += hexToInt(output.cell_output.capacity);

	const txFee = hexToInt(tx.inputs[0].cell_output.capacity) - outputCapacity;

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
	signTransaction,
	validateLab
};
