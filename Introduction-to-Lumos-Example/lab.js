"use strict";

const {describeTransaction: libDescribeTransaction} = require("../lib/index.js");

function describeTransaction(transaction)
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

async function initializeLab(nodeUrl, indexer)
{
	// Nothing to do in this lab.
}

async function validateLab(transaction)
{
	// Nothing to do in this lab.
}

module.exports =
{
	describeTransaction,
	initializeLab,
	validateLab
};
