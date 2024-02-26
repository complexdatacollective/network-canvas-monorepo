import React, { createContext } from 'react';

type DialogContextType = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const DialogContext = createContext<DialogContextType>({
  open: false,
  setOpen: () => undefined,
});

type DialogContextProviderProps = {
  children: React.ReactNode;
} & DialogContextType;

export const DialogContextProvider: React.FC<DialogContextProviderProps> = ({
  children,
  open,
  setOpen,
}) => {
  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
};
