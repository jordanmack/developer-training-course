"use strict";

import {describeTransaction as libDescribeTransaction} from "../lib/index.js";

export function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showWitnesses: false,
		showInputType: false,
		showOutputType: false,
	};

	return libDescribeTransaction(transaction, options);
}

export async function initializeLab(NODE_URL, indexer)
{
	// Nothing to do in this lab.
}

export async function validateLab(transaction)
{
	// Nothing to do in this lab.
}

export default {
	describeTransaction,
	initializeLab,
	validateLab
};
