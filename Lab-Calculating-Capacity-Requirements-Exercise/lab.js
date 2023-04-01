"use strict";

import lib from "../lib/index.js";
import {ckbytesToShannons, hexToInt} from "../lib/util.js";

export function describeTransaction(transaction)
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

export async function initializeLab()
{
	// Nothing to do in this lab.
}

export async function validateLab(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length != 1)
		throw new Error("This lab requires a single input Cell.");

	if(tx.outputs.length != 2)
		throw new Error("This lab requires two output cells.");

	if(hexToInt(tx.outputs[0].cellOutput.capacity) != ckbytesToShannons(1_000n))
		throw new Error("This lab requires output 0 to have a capacity of 1,000 CKBytes.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");
	
	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);

	if(TX_FEE != 10_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.0001 CKBytes.");
}

export default {
	describeTransaction,
	initializeLab,
	validateLab
};