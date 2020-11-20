"use strict";

const {values} = require("@ckb-lumos/base");
const {addressToScript} = require("@ckb-lumos/helpers");
const {ScriptValue} = values;
const {Reader, RPC} = require("ckb-js-toolkit");
const secp256k1 = require("secp256k1");

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

function intToHex(num)
{
	return "0x"+(BigInt(num)).toString(16);
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
			capacity: formattedNumber(BigInt(input.cell_output.capacity)) + " Shannons",
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
			capacity: formattedNumber(BigInt(output.cell_output.capacity)) + " Shannons",
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

function describeTransactionSimple(transaction)
{
	const options =
	{
		showCellDeps: true,
		showInputs: true,
		showOutputs: true,
		showWitnesses: true
	};

	return describeTransaction(transaction, options);
}

async function indexerReady(indexer, updateProgress=false, timeoutMs=300_000, recheckMs=500)
{
	return new Promise(async (resolve, reject) =>
	{
		const timeoutTimer = (timeoutMs !== 0) ? setTimeout(()=>{reject(Error("Indexer timeout."));}, timeoutMs) : false;

		while(true)
		{
			const rpc = new RPC(indexer.uri)
			const rpcTip = BigInt(await rpc.get_tip_block_number());

			const indexerTipObj = await indexer.tip();

			if(!!indexerTipObj)
			{
				const indexerTip = BigInt(indexerTipObj.block_number);

				if(rpcTip === indexerTip)
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}

				if(!!updateProgress)
					updateProgress(indexerTip, rpcTip);
			}

			await new Promise((resolve, _reject) =>
			{
				setTimeout(resolve, recheckMs);
			});
		}

		resolve();
	});
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

module.exports =
{
	addressToScript,
	ckbytesToShannons,
	describeTransaction,
	describeTransactionSimple,
	formattedNumber,
	getRandomInt,
	indexerReady,
	intToHex,
	shannonsToCkbytes,
	shannonsToCkbytesFormatted,
	signMessage
};
