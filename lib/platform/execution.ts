import type { Candle } from "./contracts";
import { clamp } from "./math";

export type OrderType = "market" | "limit" | "stop" | "stop-limit";
export interface SimulatedOrder { id:string;symbol:string;side:"buy"|"sell";type:OrderType;quantity:number;limitPrice?:number;stopPrice?:number;createdAt:number;timeInForce?:"GTC"|"IOC"; }
export interface InstrumentRules { tickSize:number;lotSize:number;minimumQuantity:number;minimumNotional:number;maximumVolumeParticipation:number;allowShort:boolean; }
export interface ExecutionCosts { feeBps:number;spreadBps:number;slippageBps:number; }
export interface FillResult { status:"filled"|"partially-filled"|"open"|"rejected";filledQuantity:number;remainingQuantity:number;fillPrice?:number;fee:number;slippage:number;reason?:string; }

const roundDown=(value:number,step:number)=>step>0?Math.floor((value+1e-12)/step)*step:value;
const roundPrice=(value:number,tick:number)=>tick>0?Math.round(value/tick)*tick:value;

export function simulateOrder(order:SimulatedOrder,candle:Candle,rules:InstrumentRules,costs:ExecutionCosts,currentQuantity=0):FillResult{
  if(!candle.complete)return{status:"rejected",filledQuantity:0,remainingQuantity:order.quantity,fee:0,slippage:0,reason:"Incomplete candle"};
  if(!(order.quantity>0))return{status:"rejected",filledQuantity:0,remainingQuantity:order.quantity,fee:0,slippage:0,reason:"Quantity must be positive"};
  const quantity=roundDown(order.quantity,rules.lotSize);if(quantity<rules.minimumQuantity)return{status:"rejected",filledQuantity:0,remainingQuantity:order.quantity,fee:0,slippage:0,reason:"Below minimum quantity"};
  if(!rules.allowShort&&order.side==="sell"&&quantity>currentQuantity)return{status:"rejected",filledQuantity:0,remainingQuantity:order.quantity,fee:0,slippage:0,reason:"Spot short sale rejected"};
  const stopTriggered=order.stopPrice===undefined||(order.side==="buy"?candle.high>=order.stopPrice:candle.low<=order.stopPrice);let requestedPrice:number|undefined;
  if(order.type==="market")requestedPrice=candle.open;
  else if(order.type==="limit"||(order.type==="stop-limit"&&stopTriggered)){if(order.limitPrice===undefined)return{status:"rejected",filledQuantity:0,remainingQuantity:quantity,fee:0,slippage:0,reason:"Limit price required"};const touched=order.side==="buy"?candle.low<=order.limitPrice:candle.high>=order.limitPrice;if(touched)requestedPrice=order.side==="buy"?Math.min(order.limitPrice,candle.open):Math.max(order.limitPrice,candle.open);}
  else if(order.type==="stop"&&stopTriggered){if(order.stopPrice===undefined)return{status:"rejected",filledQuantity:0,remainingQuantity:quantity,fee:0,slippage:0,reason:"Stop price required"};requestedPrice=order.side==="buy"?Math.max(order.stopPrice,candle.open):Math.min(order.stopPrice,candle.open);}
  if(requestedPrice===undefined)return{status:"open",filledQuantity:0,remainingQuantity:quantity,fee:0,slippage:0};
  const available=roundDown(Math.max(0,candle.volume*clamp(rules.maximumVolumeParticipation,0,1)),rules.lotSize);const filled=Math.min(quantity,available);if(filled<rules.minimumQuantity)return{status:order.timeInForce==="IOC"?"rejected":"open",filledQuantity:0,remainingQuantity:quantity,fee:0,slippage:0,reason:"Insufficient simulated liquidity"};
  const spread=costs.spreadBps/20_000;const impact=costs.slippageBps/10_000*Math.min(1,filled/Math.max(available,1e-12));const sign=order.side==="buy"?1:-1;const fillPrice=roundPrice(requestedPrice*(1+sign*(spread+impact)),rules.tickSize);const notional=filled*fillPrice;if(notional<rules.minimumNotional)return{status:"rejected",filledQuantity:0,remainingQuantity:quantity,fee:0,slippage:0,reason:"Below minimum notional"};
  return{status:filled<quantity?"partially-filled":"filled",filledQuantity:filled,remainingQuantity:quantity-filled,fillPrice,fee:notional*costs.feeBps/10_000,slippage:filled*Math.abs(fillPrice-requestedPrice)};
}
