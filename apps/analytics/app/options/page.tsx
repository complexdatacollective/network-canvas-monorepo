"use client";

import React, { useState } from "react";

const eventTypes = [
  "AppSetup",
  "ProtocolInstalled",
  "InterviewStarted",
  "InterviewCompleted",
  "DataExported",
  "Error",
];

const DropdownMenu = () => {
  const [selectedOptions, setSelectedOptions] = useState(
    eventTypes.map((eventType) => ({ text: eventType, isSelected: true }))
  );

  const toggleOption = (option: string) => {
    setSelectedOptions((prevOptions) =>
      prevOptions.map((prevOption) =>
        prevOption.text === option
          ? { ...prevOption, isSelected: !prevOption.isSelected }
          : prevOption
      )
    );
  };

  const toggleAllOptions = (isSelected: boolean) => {
    setSelectedOptions((prevOptions) =>
      prevOptions.map((prevOption) => ({ ...prevOption, isSelected }))
    );
  };

  const isAllSelected = selectedOptions.every((option) => option.isSelected);

  return (
    <div className="border-2 p-4">
      <label className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md">
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={() => toggleAllOptions(!isAllSelected)}
        />
        All
      </label>
      {selectedOptions.map((option) => (
        <label
          className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md"
          key={option.text}
        >
          <input
            type="checkbox"
            checked={option.isSelected}
            onChange={() => toggleOption(option.text)}
          />
          {option.text}
        </label>
      ))}
    </div>
  );
};

export default DropdownMenu;
