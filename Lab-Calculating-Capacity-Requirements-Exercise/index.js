"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {ckbytesToShannons, hexToInt, intToHex, sendTransaction, waitForNextBlock, waitForTransactionConfirmation} = require("../lib/index.js");
const {addInput, addOutput, describeTransaction, getLiveCell, initializeLab, signTransaction, validateLab} = require("./lab.js");

const nodeUrl = "http://127.0.0.1:8114/";
const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const previousOutput =
{
	tx_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
	index: "0x0"
};
const txFee = 10_000n;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction} = await initializeLab(nodeUrl);

	// Add the input cell to the transaction.
	const input = await getLiveCell(nodeUrl, previousOutput);
	transaction = addInput(transaction, input);

	// Create a Cell with 1,000 CKBytes.
	const outputCapacity1 = intToHex(ckbytesToShannons(1_000n));
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address), type: null}, data: "0x"};
	transaction = addOutput(transaction, output1);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = ???;
	const output2 = ???;
	transaction = addOutput(transaction, output2);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the next block, then begin checking if the transaction has confirmed.
	await waitForNextBlock(nodeUrl);
	process.stdout.write("Waiting for transaction to confirm.");
	await waitForTransactionConfirmation(nodeUrl, txid, (_status)=>process.stdout.write("."), {timeoutMs: 0, recheckMs: 3_000});
	console.log("\n");

	console.log("Lab exercise completed successfully!");
}
main();
