"use strict";

const {core, utils, values} = require("@ckb-lumos/base");
const {computeScriptHash} = utils;
const {CellCollector} = require("@ckb-lumos/indexer");
const {ScriptValue} = values;
const {normalizers, Reader, RPC} = require("ckb-js-toolkit");
const secp256k1 = require("secp256k1");

const DEFAULT_LOCK_HASH = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";
const SECP_SIGNATURE_PLACEHOLDER = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function formattedNumber(number)
{
	return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function ckbytesToShannons(ckbytes)
{
	ckbytes = BigInt(ckbytes);

	return ckbytes * 100_000_000n;
}

function shannonsToCkbytes(shannons)
{
	shannons = BigInt(shannons);

	return shannons / 100_000_000n;
}

function shannonsToCkbytesFormatted(shannons)
{
	return formattedNumber(shannonsToCkbytes(shannons));
}

function getRandomInt(min, max)
{
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hexToInt(hex)
{
	hex = String(hex);
	if(hex.substr(0, 2) !== "0x" && hex.substr(0,3) !== "-0x")
		throw new Error(`Invalid hex value: "${hex}"`);

	const negative = (hex[0] === "-");
	const hexValue = hex.replace("-", "");
	let bigInt = BigInt(hexValue);
	if(negative) bigInt *= -1n;

	return bigInt;
}

function intToHex(num)
{
	let bigNum = BigInt(num);
	const prefix = (bigNum > 0n) ? "0x" : "-0x";
	if(bigNum < 0n) bigNum *= -1n;
	const hexValue = prefix + bigNum.toString(16);

	return hexValue;
}

async function addDefaultWitnessPlaceholders(transaction)
{
	if(transaction.witnesses.size !== 0)
		throw new Error("This function can only be used on an empty witnesses structure.");

	// Cycle through all inputs adding placeholders for unique locks, and empty witnesses in all other places.
	let uniqueLocks = new Set();
	for(const input of transaction.inputs)
	{
		let witness = "0x";

		const lockHash = computeScriptHash(input.cell_output.lock);
		if(!uniqueLocks.has(lockHash))
		{
			uniqueLocks.add(lockHash);
			witness = SECP_SIGNATURE_PLACEHOLDER;
		}

		witness = new Reader(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: witness}))).serializeJson();
		transaction = transaction.update("witnesses", (w)=>w.push(witness));
	}

	return transaction;
}

function checkTxFee(transaction)
{
	const tx = transaction.toJS();

	let capacityInputs = 0n;
	let capacityOutputs = 0n;

	for(let input of tx.inputs)
		capacityInputs += BigInt(input.cell_output.capacity);	

	for(let output of tx.outputs)
		capacityOutputs += BigInt(output.cell_output.capacity);

	if(capacityInputs - capacityOutputs > ckbytesToShannons(1))
		throw new Error(`Transaction fee too high: ${shannonsToCkbytesFormatted(capacityInputs - capacityOutputs)} CKBytes. A normal transaction fee is < 1 CKByte.`);
}

/**
 * Collects Cells for use as capacity from the specified lock script.
 * 
 * This will search for Cells with at least capacityRequired. If there is insufficient capacity available an error will be thrown.
 * 
 * @example
 * const {inputCells, inputCapacity} = await collectCapacity(indexer, addressToScript("ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37"), ckbytesToShannons(100n));
 * 
 * @param {Object} indexer An instance of a running Lumos Indexer.
 * @param {Object} lockScript A script used to query the CellCollector to find Cells to use as capacity.
 * @param {BigInt} capacityRequired The number of CKBytes necessary
 * 
 * @returns {Object} An object with the inputCells[] found and the inputCapacity contained within the provided Cells.  
 */
async function collectCapacity(indexer, lockScript, capacityRequired)
{
	const query = {lock: lockScript, type: null};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells = [];
	let inputCapacity = 0n;

	for await (const cell of cellCollector.collect())
	{
		inputCells.push(cell);
		inputCapacity += hexToInt(cell.cell_output.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Unable to collect enough cells to fulfill the capacity requirements.");

	return {inputCells, inputCapacity};
}

function describeTransaction(transaction, options = {showCellDeps: true, showInputs: true, showOutputs: true, showWitnesses: true})
{
	let obj =
	{
		deps: [],
		inputs: [],
		outputs: [],
		witnesses: []
	};

	for(const dep of transaction.cellDeps)
	{
		let cell =
		{
			dep_type: dep.dep_type,
			out_point: dep.out_point.tx_hash + "-" + dep.out_point.index
		};
		obj.deps.push(cell);
	}

	for(const input of transaction.inputs)
	{
		let cell =
		{
			capacity: formattedNumber(hexToInt(input.cell_output.capacity)) + " Shannons",
			lock: new ScriptValue(input.cell_output.lock).hash(),
			type: (!!input.cell_output.type) ? new ScriptValue(input.cell_output.type).hash() : null,
			out_point: input.out_point.tx_hash + "-" + input.out_point.index
		};
		obj.inputs.push(cell);
	}

	for(const output of transaction.outputs)
	{
		let cell =
		{
			capacity: formattedNumber(hexToInt(output.cell_output.capacity)) + " Shannons",
			lock: new ScriptValue(output.cell_output.lock).hash(),
			type: (!!output.cell_output.type) ? new ScriptValue(output.cell_output.type).hash() : null,
		};
		obj.outputs.push(cell);
	}

	obj.witnesses = transaction.witnesses;

	if(options.showCellDeps)
	{
		console.log("Cell Deps:");
		for(const dep of obj.deps)
		{
			console.log("  - dep_type: " + dep.dep_type);
			console.log("    out_point: " + dep.out_point);
		}
	}

	if(options.showInputs)
	{
		console.log("Inputs:");
		for(const input of obj.inputs)
		{
			console.log("  - capacity: " + input.capacity);
			console.log("    lock: " + input.lock);
			console.log("    type: " + input.type);
			console.log("    out_point: " + input.out_point);
		}
	}

	if(options.showOutputs)
	{
		console.log("Outputs:");
		for(const output of obj.outputs)
		{
			console.log("  - capacity: " + output.capacity);
			console.log("    lock: " + output.lock);
			console.log("    type: " + output.type);
		}
	}

	if(options.showWitnesses)
	{
		console.log("Witnesses:");
		for(const witness of obj.witnesses)
		{
			console.log("  - " + witness);
		}
	}

	console.log();
}

async function getLiveCell(nodeUrl, outPoint, returnData = false)
{
	const rpc = new RPC(nodeUrl);
	const res = await rpc.get_live_cell({tx_hash: outPoint.tx_hash, index: outPoint.index}, returnData);

	if(res.status === "dead")
		throw new Error(`Dead Cell found at out point: ${outPoint.tx_hash}-${outPoint.index}`);

	if(res.status !== "live")
		throw new Error(`Live Cell not found at out point: ${outPoint.tx_hash}-${outPoint.index}`);

	const cell =
	{
		cell_output:
		{
			capacity: res.cell.output.capacity,
			lock: {code_hash: res.cell.output.lock.code_hash, hash_type: res.cell.output.lock.hash_type, args: res.cell.output.lock.args},
			type: (!res.cell.output.type) ? undefined : {code_hash: res.cell.output.type.code_hash, hash_type: res.cell.output.type.hash_type, args: res.cell.output.type.args}
		},
		out_point:
		{
			tx_hash: outPoint.tx_hash,
			index: outPoint.index
		},
		data: (returnData) ? res.cell.data.content : null
	}

	return cell;
}

async function indexerReady(indexer, updateProgress=((_indexerTip, _rpcTip)=>{}), options={timeoutMs: 300_000, recheckMs: 500})
{
	return new Promise(async (resolve, reject) =>
	{
		let timedOut = false;
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(indexer.uri);

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			const indexerTipObj = await indexer.tip();
			const rpcResponse = await rpc.get_tip_block_number();

			if(!indexerTipObj)
				return reject(Error("Indexer gave an unexpected response."));
			
			if(!rpcResponse)
				return reject(Error("RPC gave an unexpected response."));
	
			const indexerTip = BigInt(indexerTipObj.block_number);
			const rpcTip = BigInt(rpcResponse);

			if(rpcTip === indexerTip)
			{
				if(timeoutTimer)
					clearTimeout(timeoutTimer);

				break;
			}

			updateProgress(indexerTip, rpcTip);

			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

async function sendTransaction(nodeUrl, signedTx)
{
	const rpc = new RPC(nodeUrl);
	const result = await rpc.send_transaction(signedTx);
	
	return result;
}

function signMessage(privateKey, message)
{
	const messageArray = new Uint8Array(new Reader(message).toArrayBuffer());
	const pkArray = new Uint8Array(new Reader(privateKey).toArrayBuffer());
	const {signature, recid} = secp256k1.ecdsaSign(messageArray, pkArray);
	const array = new Uint8Array(65);
	array.set(signature, 0);
	array.set([recid], 64);

	return new Reader(array.buffer).serializeJson();
}

async function waitForTransactionConfirmation(nodeUrl, txid, updateProgress=((_status)=>{}), options={timeoutMs: 300_000, recheckMs: 500, throwOnNotFound: true})
{
	return new Promise(async (resolve, reject) =>
	{
		let timedOut = false;
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(nodeUrl);

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			const transaction = await rpc.get_transaction(txid);

			if(!!transaction)
			{
				const status = transaction.tx_status.status;

				updateProgress(status);

				if(status === "committed")
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}
			}
			else if(transaction === null)
			{
				if(options.throwOnNotFound)
					return reject(Error("Transaction was not found."));
				else
					updateProgress("not_found");
			}
			
			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

async function waitForNextBlock(nodeUrl, blocks=1n, updateProgress=((_startTip, _tip)=>{}), options={timeoutMs: 300_000, recheckMs: 500})
{
	return new Promise(async (resolve, reject) =>
	{
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(nodeUrl);
		
		blocks = BigInt(blocks);
		let timedOut = false;
		let startTip = 0n;

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			let tip = await rpc.get_tip_block_number();

			if(!!tip)
			{
				tip = BigInt(tip);

				if(startTip === 0n)
					startTip = tip;

				updateProgress(startTip, tip);

				if(tip >= startTip + blocks)
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}
			}
			else
				return reject(Error("RPC gave an unexpected response."));

			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

module.exports =
{
	addDefaultWitnessPlaceholders,
	checkTxFee,
	ckbytesToShannons,
	collectCapacity,
	DEFAULT_LOCK_HASH,
	describeTransaction,
	formattedNumber,
	getLiveCell,
	getRandomInt,
	hexToInt,
	indexerReady,
	intToHex,
	SECP_SIGNATURE_PLACEHOLDER,
	sendTransaction,
	shannonsToCkbytes,
	shannonsToCkbytesFormatted,
	signMessage,
	waitForTransactionConfirmation,
	waitForNextBlock
};
