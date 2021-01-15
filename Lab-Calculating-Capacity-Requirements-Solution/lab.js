"use strict";

const lib = require("../lib/index.js");
const {ckbytesToShannons, hexToInt} = require("../lib/util.js");

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showInputs: true,
		showInputType: false,
		showOutputs: true,
		showOutputType: false,
		showWitnesses: false
	};

	return lib.describeTransaction(transaction, options);
}

async function initializeLab(nodeUrl, indexer)
{
	// Nothing to do in this lab.
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
	describeTransaction,
	initializeLab,
	validateLab
};
