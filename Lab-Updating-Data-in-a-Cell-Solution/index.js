"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {CellCollector} = require("@ckb-lumos/indexer");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, initializeLumosIndexer, readFileToHexString, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the filename that contains the data we want to include in
const dataFile1 = "../files/HelloNervos.txt";
const dataFile2 = "../files/HelloWorld.txt";
const dataFile3 = "../files/LoremIpsum.txt";

// This is the TX fee amount that will be paid in Shannons.
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

	// Locate the live cells with the data from dataFile1 add them as an inputs.
	const {hexString} = await readFileToHexString(dataFile1);
	const query = {lock: addressToScript(address1), type: null, data: hexString};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
	{
		transaction = transaction.update("inputs", (i)=>i.concat(cell));
	}

	// Create cells with data from the dataFile2 and dataFile3.
	const dataFiles = [dataFile2, dataFile3];
	for(const dataFile of dataFiles)
	{
		const {hexString} = await readFileToHexString(dataFile);
		const outputCapacity = intToHex(ckbytesToShannons(61n) + ckbytesToShannons((hexString.length - 2) / 2));
		const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(address1), type: null}, data: hexString};
		transaction = transaction.update("outputs", (i)=>i.push(output));
	}

	// Calculate the capacity sum of the inputs and outputs.
	let inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	let outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input cells to the transaction to use for capacity, if needed.
	let capacityRequired = outputCapacity - inputCapacity + txFee; // (output1 + output2) - (input1 + input2) + tx fee
	if(capacityRequired !== 0n && capacityRequired > ckbytesToShannons(-61n))
	{
		capacityRequired += ckbytesToShannons(61n);
		const {inputCells} = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
		transaction = transaction.update("inputs", (i)=>i.concat(inputCells));
	}

	// Recalculate the capacity sum of the inputs and outputs.
	inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes, if needed.
	if(inputCapacity - outputCapacity - txFee > 0n)
	{
		const changeCellCapacity = intToHex(inputCapacity - outputCapacity - txFee);
		const output2 = {cell_output: {capacity: changeCellCapacity, lock: addressToScript(address1), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output2));
	}

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
