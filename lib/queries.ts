import "server-only";
import { warehouseEnabled } from "./db";
import * as wh from "./warehouse";
import * as mock from "./data";
import { Filter } from "./types";

// Single seam: read from the Neon warehouse when DATABASE_URL is set, otherwise
// fall back to the built-in sample data so the app always runs.
const live = warehouseEnabled();

export const getOverviewKpis = (f: Filter) => (live ? wh.overviewKpis(f) : Promise.resolve(mock.getOverviewKpis(f)));
export const getTrend = (f: Filter) => (live ? wh.trend(f) : Promise.resolve(mock.getTrend(f)));
export const getChannelSplit = (f: Filter) => (live ? wh.channelSplit(f) : Promise.resolve(mock.getChannelSplit(f)));
export const getTopProducts = (f: Filter, limit?: number) =>
  live ? wh.topProducts(f, limit) : Promise.resolve(mock.getTopProducts(f, limit));
export const getDecisions = (f: Filter) => (live ? wh.decisions(f) : Promise.resolve(mock.getDecisions(f)));

export const getSalesKpis = (f: Filter) => (live ? wh.salesKpis(f) : Promise.resolve(mock.getSalesKpis(f)));
export const getOrdersPerDay = (f: Filter) => (live ? wh.ordersPerDay(f) : Promise.resolve(mock.getOrdersPerDay(f)));
export const getRecentOrders = (f: Filter, limit?: number) =>
  live ? wh.recentOrders(f, limit) : Promise.resolve(mock.getRecentOrders(f, limit));

export const getStockHealth = (f: Filter) => (live ? wh.stockHealth(f) : Promise.resolve(mock.getStockHealth(f)));
export const getInventoryKpis = (f: Filter) => (live ? wh.inventoryKpis(f) : Promise.resolve(mock.getInventoryKpis(f)));

export const getAdvertisingKpis = () => (live ? wh.advertisingKpis() : Promise.resolve(mock.getAdvertisingKpis()));
export const getCampaigns = () => (live ? wh.campaigns() : Promise.resolve(mock.getCampaigns()));
export const getWasted = () => (live ? wh.wasted() : Promise.resolve(mock.getWasted()));

export const getReturns = (f: Filter) => (live ? wh.returns() : Promise.resolve(mock.getReturns(f)));
export const getReturnsKpis = (f: Filter) => (live ? wh.returnsKpis() : Promise.resolve(mock.getReturnsKpis(f)));
export const getReturnReasons = () => (live ? wh.returnReasons() : Promise.resolve(mock.getReturnReasons()));

export const getProducts = () => (live ? wh.products() : Promise.resolve(mock.getProducts()));
export const decisionCount = () => (live ? wh.decisionCount() : Promise.resolve(mock.decisionCount()));

// pure helpers (no data source)
export { adChannelAvailable } from "./data";
