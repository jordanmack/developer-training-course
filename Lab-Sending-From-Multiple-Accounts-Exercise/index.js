"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton, sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, signMessage, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, initializeLumosIndexer, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const { ALICE_ADDRESS, ALICE_PK, BOB_ADDRESS, BOB_PK, CHARLIE_ADDRESS, CHARLIE_PK, DANIEL_ADDRESS } = require('./accounts');

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = ?;

async function runLab(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Add capacity to the transaction.
	?
	// Create an output cell using the default lock script.
	?
	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	?

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);
	await indexerReady(indexer);

	// Create some cells using the default lock script.
	await runLab(indexer);

	console.log("Lab completed successfully!");
}
main();
