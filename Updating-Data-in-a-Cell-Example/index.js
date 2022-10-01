"use strict";

const {CellCollector, Indexer} = require("@ckb-lumos/ckb-indexer"); 
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, readFileToHexString, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");
const config = require("../config.json");

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8116/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// These are the files that contains the data we are searching for and put into cells.
const DATA_FILE_1 = "../files/HelloNervos.txt";
const DATA_FILE_2 = "../files/HelloWorld.txt";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);

	// Locate a single live cell with the desired data and add it as an input.
	const {hexString: hexString1} = await readFileToHexString(DATA_FILE_1);
	const query = {lock: addressToScript(ADDRESS_1), type: null, data: hexString1};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
	{
		transaction = transaction.update("inputs", (i)=>i.concat(cell));
		break;
	}
	if(transaction.inputs.size === 0)
		throw new Error("Unable to locate a live cell with the expected data.");

	// Calculate the total capacity of all inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a cell with data from the specified file.
	const {hexString: hexString2} = await readFileToHexString(DATA_FILE_2);
	const outputCapacity1 = intToHex(inputCapacity - TX_FEE);
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(ADDRESS_1), type: null}, data: hexString2};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
