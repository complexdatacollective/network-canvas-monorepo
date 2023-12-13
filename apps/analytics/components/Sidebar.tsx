"use client";

import { useState } from "react";
import { ShieldAlert, BarChartBig, Globe2 } from "lucide-react";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Analytics", href: "/", icon: BarChartBig },
  { name: "Regions", href: "/regions", icon: Globe2 },
  { name: "Errors", href: "/errors", icon: ShieldAlert },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [current, setCurrent] = useState<string | null>(() => {
    const currentItem = navigation.find((item) => item.href === pathname);
    return currentItem ? currentItem.name : null;
  });

  return (
    <>
      <div>
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6 ring-1 ring-white/5">
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
                          onClick={() => setCurrent(item.name)}
                          className={classNames(
                            current === item.name
                              ? "bg-gray-800 text-white"
                              : "text-gray-400 hover:text-white hover:bg-gray-800",
                            "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold"
                          )}
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
      </div>
    </>
  );
}
