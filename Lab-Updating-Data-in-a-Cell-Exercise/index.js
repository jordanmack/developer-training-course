"use strict";

import fs from "fs";
import {initializeConfig} from "@ckb-lumos/config-manager";
import {CellCollector, Indexer} from "@ckb-lumos/ckb-indexer";
import {addressToScript, TransactionSkeleton} from "@ckb-lumos/helpers";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, readFileToHexString, sendTransaction, signTransaction, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, hexToInt, intToHex} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the filename that contains the data we want to include in
const DATA_FILE_1 = "../files/HelloNervos.txt";
const DATA_FILE_2 = "../files/HelloWorld.txt";
const DATA_FILE3 = "../files/LoremIpsum.txt";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);

	// Locate the live cells with the data from DATA_FILE_1 add them as an inputs.
	???

	// Create cells with data from the DATA_FILE_2 and DATA_FILE3.
	???

	// Add input cells to the transaction to use for capacity.
	???

	// Create a change Cell for the remaining CKBytes.
	???

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
