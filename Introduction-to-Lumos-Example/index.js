"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, getLiveCell, initializeLumosIndexer, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

const nodeUrl = "http://127.0.0.1:8114/";
const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const previousOutput =
{
	tx_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
	index: "0x0"
};
const txFee = 100_000n;

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);

	// Add the input cell to the transaction.
	const input = await getLiveCell(nodeUrl, previousOutput);
	transaction = transaction.update("inputs", (i)=>i.push(input));

	// Add an output cell.
	const outputCapacity = intToHex(hexToInt(input.cell_output.capacity) - txFee);
	const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(address), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
