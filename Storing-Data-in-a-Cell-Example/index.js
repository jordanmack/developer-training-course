"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {addDefaultWitnessPlaceholders, ckbytesToShannons, collectCapacity, hexToInt, intToHex, readFileToHexString, sendTransaction, waitForTransactionConfirmation, waitForNextBlock} = require("../lib/index.js");
const {addInputs, addOutput, describeTransaction, initializeLab, signTransaction, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the filename that contains the data we want to include in
const dataFile = "../files/HelloNervos.txt";

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction, indexer} = await initializeLab(nodeUrl);

	// Create a Cell with a capacity large enough for the data being placed in it.
	const {hexString, dataSize} = await readFileToHexString(dataFile);
	const outputCapacity1 = intToHex(ckbytesToShannons(61n) + ckbytesToShannons(dataSize));
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address1), type: null}, data: hexString};
	transaction = addOutput(transaction, output1);

	// Add the input cell to the transaction.
	const capacityRequired = hexToInt(outputCapacity1) + ckbytesToShannons(61n); // output1 + minimum for a change cell
	const {inputCells} = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
	transaction = addInputs(transaction, inputCells);

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - outputCapacity - txFee);
	const output2 = {cell_output: {capacity: outputCapacity2, lock: addressToScript(address1), type: null}, data: "0x"};
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

	console.log("Example completed successfully!");
}
main();
