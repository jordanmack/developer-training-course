"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, getLiveCell, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction} = require("./lab.js");
const config = require("./config.json");

const NODE_URL = "http://127.0.0.1:8114/";
const PRIVATE_KEY = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const ADDRESS = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const PREVIOUS_OUTPUT =
{
	tx_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
	index: "0x0"
};
const TX_FEE = 100_000n;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Add the input cell to the transaction.
	const input = await getLiveCell(NODE_URL, PREVIOUS_OUTPUT);
	transaction = transaction.update("inputs", (i)=>i.push(input));

	// Add an output cell.
	const outputCapacity = intToHex(hexToInt(input.cell_output.capacity) - TX_FEE);
	const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
