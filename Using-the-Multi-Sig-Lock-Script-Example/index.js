"use strict";

import fs from "fs";
import {blockchain, utils} from "@ckb-lumos/base";
const {ckbHash} = utils;
import {bytes} from "@ckb-lumos/codec"
import {secp256k1Blake160Multisig} from "@ckb-lumos/common-scripts";
import {initializeConfig} from "@ckb-lumos/config-manager";
import {normalizers} from "ckb-js-toolkit";
import {addressToScript, locateCellDep, TransactionSkeleton, sealTransaction} from "@ckb-lumos/helpers";
import {Indexer} from "@ckb-lumos/ckb-indexer";
import {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, sendTransaction, signMessage, signTransaction, waitForTransactionConfirmation, MULTISIG_LOCK_HASH} from "../lib/index.js";
import {arrayBufferToHex, ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} from "../lib/util.js";
import {describeTransaction, initializeLab, validateLab} from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// Multi-Sig configuration.
const multisigAddresses =
[
	"ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q",
	"ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga",
	"ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq28phxutezqvjgfv5q38gn5kwek4m9km3cmajeqs"
];
const multisigReserved = 0;
const multisigMustMatch = 0;
const multisigThreshold = 1;
const multisigPublicKeys = multisigAddresses.length;

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

// Creates a cell using the Secp256k1-Blake2b multi-sig lock.
async function createMultisigCell(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell that uses the multi-sig lock.
	const outputCapacity1 = intToHex(ckbytesToShannons(61n) + TX_FEE);
	const multisigScript = "0x"
		+ multisigReserved.toString(16).padStart(2, "0")
		+ multisigMustMatch.toString(16).padStart(2, "0")
		+ multisigThreshold.toString(16).padStart(2, "0")
		+ multisigPublicKeys.toString(16).padStart(2, "0")
		+ multisigAddresses.map((ADDRESS)=>addressToScript(ADDRESS).args.substr(2)).join("");
	const multisigHash = ckbHash(hexToArrayBuffer(multisigScript)).substr(0, 42);
	const lockScript1 =
	{
		codeHash: MULTISIG_LOCK_HASH,
		hashType: "type",
		args: multisigHash
	};
	const output1 = {cellOutput: {capacity: outputCapacity1, lock: lockScript1, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add capacity to the transaction.
	const capacityRequired = hexToInt(outputCapacity1) + ckbytesToShannons(61n) + TX_FEE; // output1 + minimum for a change cell + tx fee
	const {inputCells} = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(inputCells));

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - outputCapacity - TX_FEE);
	const output2 = {cellOutput: {capacity: outputCapacity2, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));	

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

	return {txHash: txid, index: "0x0"};
}

// Consumes the cell with the multi-sig lock and sends the capacity to ADDRESS_1.
async function consumeMultisigCell(indexer, multisigCellOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({codeHash: MULTISIG_LOCK_HASH, hashType: "type"})));

	// Add the input cell to the transaction.
	const input = await getLiveCell(NODE_URL, multisigCellOutPoint);
	transaction = transaction.update("inputs", (i)=>i.push(input));

	// Get the capacity sums of the inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - TX_FEE);
	const output2 = {cellOutput: {capacity: outputCapacity2, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));	

	// Add in the witness placeholders.
	const multisigScript = "0x"
		+ multisigReserved.toString(16).padStart(2, "0")
		+ multisigMustMatch.toString(16).padStart(2, "0")
		+ multisigThreshold.toString(16).padStart(2, "0")
		+ multisigPublicKeys.toString(16).padStart(2, "0")
		+ multisigAddresses.map((ADDRESS)=>addressToScript(ADDRESS).args.substr(2)).join("");
	const multisigPlaceholder = multisigScript + "0".repeat(130).repeat(multisigThreshold);
	const witness = bytes.hexify(blockchain.WitnessArgs.pack({lock: multisigPlaceholder}));
	transaction = transaction.update("witnesses", (w)=>w.push(witness));

	// Sign the transaction.
	transaction = secp256k1Blake160Multisig.prepareSigningEntries(transaction);
	const signingEntries = transaction.get("signingEntries").toArray();
	const signature1 = signMessage(PRIVATE_KEY_1, signingEntries[0].message);
	const multisigSignature = multisigScript + signature1.substr(2);
	const signedTx = sealTransaction(transaction, [multisigSignature]);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a cell using the multi-sig lock.
	const multisigCellOutPoint = await createMultisigCell(indexer);
	await indexerReady(indexer);

	// Unlock and consume the cell we created with the multi-sig lock.
	await consumeMultisigCell(indexer, multisigCellOutPoint);
	await indexerReady(indexer);

	console.log("Example completed successfully!\n");
}
main();
