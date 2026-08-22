import type { Metadata } from "next";
import CostFloorApp from "./CostFloorApp";

export const metadata: Metadata = {
  title: "CostFloor — The price of an automated economy",
  description:
    "Trace a product's price through labor, capital, materials, and energy to estimate its automated production cost floor.",
};

export default function Home() {
  return <CostFloorApp />;
}
