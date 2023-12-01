"use client";
import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ShieldAlert, BarChartBig, X, Menu } from "lucide-react";
import { AnalyticsStats } from "./_components/analytics/AnalyticsStats";
import EventsTable from "./_components/analytics/EventsTable/EventsTable";
const navigation = [
  { name: "Analytics", href: "#", icon: BarChartBig, current: true },
  { name: "Errors", href: "#", icon: ShieldAlert, current: false },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Dashboard() {
  const [selectedNavItem, setSelectedNavItem] = useState(navigation[0]);

  return (
    <>
      <div>
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6">
            <div className="flex h-16 shrink-0 items-center text-white">
              Fresco Analytics
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <a
                          href={item.href}
                          className={classNames(
                            selectedNavItem === item
                              ? "bg-gray-800 text-white"
                              : "text-gray-400 hover:text-white hover:bg-gray-800",
                            "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold"
                          )}
                          onClick={() => setSelectedNavItem(item)}
                        >
                          <item.icon
                            className="h-6 w-6 shrink-0"
                            aria-hidden="true"
                          />
                          {item.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <main className="py-10 lg:pl-72 bg-gray-800">
          <header>
            <div className="flex flex-col items-start border border-white/5 justify-between gap-x-8 gap-y-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
              <div>
                <div className="flex items-center gap-x-3">
                  <div className="flex-none rounded-full bg-green-400/10 p-1 text-green-400">
                    <div className="h-2 w-2 rounded-full bg-current" />
                  </div>
                  <h1 className="flex gap-x-3 text-base leading-7">
                    <span className="font-semibold text-white">Analytics</span>
                  </h1>
                </div>
                <p className="mt-2 text-xs leading-6 text-gray-400">
                  Analytics events across all instances of Fresco.
                </p>
              </div>
            </div>
            <AnalyticsStats />
          </header>
          <div className="bg-gray-900">
            <EventsTable />
          </div>
        </main>
      </div>
    </>
  );
}
