"use strict";

const {core} = require("@ckb-lumos/base");
const {locateCellDep, sealTransaction, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector, Indexer} = require("@ckb-lumos/indexer");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {normalizers, Reader, RPC} = require("ckb-js-toolkit");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {ckbytesToShannons, describeTransction, formattedNumber, indexerReady, shannonsToCkbytesFormatted, signMessage} = require("../lib");
const CKBRPC = require("@nervosnetwork/ckb-sdk-rpc").default;
const _ = require("lodash");

const defaultLockHash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";

function addInput(skeleton, input)
{
	// Convert capacity to hex string.
	input = _.cloneDeep(input);
	input.cell_output.capacity = "0x" + BigInt(input.cell_output.capacity).toString(16);

	return skeleton.update("inputs", (i)=>i.push(input));
}

function addOutput(skeleton, output)
{
	// Convert capacity to hex string.
	output = _.cloneDeep(output);
	output.cell_output.capacity = "0x" + BigInt(output.cell_output.capacity).toString(16);

	return skeleton.update("outputs", (i)=>i.push(output));
}

async function initializeLab(nodeUrl, privateKey)
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = new Indexer(nodeUrl, "./indexed-data");
	indexer.startForever();
	await indexerReady(indexer, (indexerTip, rpcTip)=>console.log(`Indexer Progress: ${Math.floor(Number(indexerTip)/Number(rpcTip)*100)}%`), 0, 1000);
	console.log();

	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash:defaultLockHash, hash_type: "type"})));

	// Add in a placeholder witness which we will sign below.
	const witness = new Reader(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"}))).serializeJson();
	skeleton = skeleton.update("witnesses", (w)=>w.push(witness));

	return {indexer, skeleton};
}

async function getLiveCell(nodeUrl, out_point)
{
	const rpc = new CKBRPC(nodeUrl);
	const res = await rpc.getLiveCell({txHash: out_point.tx_hash, index: out_point.index}, true);

	if(res.status === "dead")
		throw new Error(`Dead Cell found at out point: ${out_point.tx_hash}-${out_point.index}`);

	if(res.status !== "live")
		throw new Error(`Live Cell not found at out point: ${out_point.tx_hash}-${out_point.index}`);

	const cell =
	{
		cell_output:
		{
			capacity: BigInt(res.cell.output.capacity),
			lock: {code_hash: res.cell.output.lock.codeHash, hash_type: res.cell.output.lock.hashType, args: res.cell.output.lock.args},
			type: (!res.cell.output.type) ? undefined : {code_hash: res.cell.output.type.codeHash, hash_type: res.cell.output.type.hashType, args: res.cell.output.type.args}
		},
		out_point:
		{
			tx_hash: out_point.tx_hash,
			index: out_point.index
		},
		data: res.cell.data.content
	}

	return cell;
}

async function sendTransaction(nodeUrl, signedTx)
{
	const rpc = new RPC(nodeUrl);
	const res = await rpc.send_transaction(signedTx);
	
	return res;
}

function signTransaction(skeleton, privateKey)
{
	// Sign the transaction with our private key.
	skeleton = secp256k1Blake160.prepareSigningEntries(skeleton);
	const signingEntries = skeleton.get("signingEntries").toArray();
	const signature = signMessage(privateKey, signingEntries[0].message);
	const tx = sealTransaction(skeleton, [signature]);

	return tx;
}

module.exports =
{
	addInput,
	addOutput,
	getLiveCell,
	initializeLab,
	sendTransaction,
	signTransaction
};
