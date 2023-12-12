"use client";
import { useState } from "react";
import { ShieldAlert, BarChartBig, X, Menu } from "lucide-react";
import { AnalyticsStats } from "./analytics/_components/AnalyticsStats";
import EventsTable from "./analytics/_components/EventsTable/EventsTable";
import Sidebar from "~/components/Sidebar";
const navigation = [
  { name: "Analytics", href: "#", icon: BarChartBig, current: true },
  { name: "Errors", href: "#", icon: ShieldAlert, current: false },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Dashboard() {
  return <div>main content</div>;
}
