"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {addDefaultWitnessPlaceholders, ckbytesToShannons, collectCapacity, hexToInt, intToHex, sendTransaction, waitForTransactionConfirmation, waitForNextBlock} = require("../lib/index.js");
const {addInput, addInputs, addOutput, describeTransaction, initializeLab, signTransaction, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be setup with a specific Cell configuration for this lab.
const privateKey = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the address we will be sending to.
const address2 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";

// This is the TX fee amount that will be paid in Shannons.
const txFee = ???;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction, indexer} = await initializeLab(nodeUrl);

	// Create a Cell with 100 CKBytes.
	const outputCapacity1 = ???;
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address2), type: null}, data: "0x"};
	transaction = addOutput(transaction, output1);

	// Add the input cell to the transaction.
	const capacityRequired = ???; // output1 + minimum for a change cell
	const {inputCells} = ???;
	transaction = addInputs(transaction, inputCells);

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = ???;
	const output2 = ???;
	transaction = addOutput(transaction, output2);	

	// Add in the witness placeholders.
	transaction = await addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	process.stdout.write("Transaction Sent: ");
	const txid = await sendTransaction(nodeUrl, signedTx);
	process.stdout.write(txid);
	console.log("\n");

	// Wait for the next block, then begin checking if the transaction has confirmed.
	await waitForNextBlock(nodeUrl);
	process.stdout.write("Waiting for transaction to confirm.");
	await waitForTransactionConfirmation(nodeUrl, txid, (_status)=>process.stdout.write("."), {timeoutMs: 0, recheckMs: 3_000});
	console.log("\n");

	console.log("Lab exercise completed successfully!");
}
main();
