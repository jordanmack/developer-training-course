"use strict";

import fs from "fs";
import {initializeConfig} from "@ckb-lumos/config-manager";
import {addressToScript, TransactionSkeleton, sealTransaction} from "@ckb-lumos/helpers";
import {Indexer} from "@ckb-lumos/ckb-indexer";
import {addDefaultCellDeps, signMessage, addDefaultWitnessPlaceholders, collectCapacity, indexerReady, sendTransaction, waitForTransactionConfirmation} from "../lib/index.js";
import {ckbytesToShannons, intToHex} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
import {secp256k1Blake160} from "@ckb-lumos/common-scripts";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// These are the private keys and accounts to use with this lab.
const ALICE_PRIVATE_KEY = "0x81dabf8f74553c07999e1400a8ecc4abc44ef81c9466e6037bd36e4ad1631c17";
const ALICE_ADDRESS = "ckt1qyq2a6ymy7fjntsc2q0jajnmljt690g4xpdsyw4k5f";
const BOB_PRIVATE_KEY = "0x5e3bcd5a3c082c9eb1559930417710a39c5249b31090d88de2a2855149d0d981";
const BOB_ADDRESS = "ckt1qyq9gstman8qyjv0ucwqnw0h6z5cn6z9xxlssmqc92";
const CHARLIE_PRIVATE_KEY = "0xdb159ba4ba1ec8abdb7e9f570c7a1a1febf05eeb3f5d6ebdd50ee3bde7740189";
const CHARLIE_ADDRESS = "ckt1qyq9sz6wanl8v3tdmq6as38yq3j9hwg637kqu3e2xn";
const DANIEL_PRIVATE_KEY = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const DANIEL_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

// These are the amounts that will be transferred.
const totalInputCapacity = ckbytesToShannons(300n);
const capacityPerPerson = totalInputCapacity / 3n;
const amountToTransfer = totalInputCapacity - TX_FEE;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Add capacity to the transaction.
	const capacityRequired = capacityPerPerson;
	for(const address of [ALICE_ADDRESS, BOB_ADDRESS, CHARLIE_ADDRESS])
	{
		const {inputCells} = await collectCapacity(indexer, addressToScript(address), capacityRequired);
		transaction = transaction.update("inputs", (i)=>i.concat(inputCells));
	}

	// Create a cell using the default lock script.
	const outputCapacity1 = intToHex(amountToTransfer);
	const output1 = {cellOutput: {capacity: outputCapacity1, lock: addressToScript(DANIEL_ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// // Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signingEntries = transaction.get("signingEntries").toArray();
	const signatureAlice = signMessage(ALICE_PRIVATE_KEY, signingEntries[0].message);
	const signatureBob = signMessage(BOB_PRIVATE_KEY, signingEntries[1].message);
	const signatureCharlie = signMessage(CHARLIE_PRIVATE_KEY, signingEntries[2].message);
	const signedTx = sealTransaction(transaction, [signatureAlice, signatureBob, signatureCharlie]);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	console.log("Lab completed successfully!");
}
main();
