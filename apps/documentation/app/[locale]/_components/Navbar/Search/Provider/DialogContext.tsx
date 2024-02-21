import React, { createContext } from 'react';

type DialogContextType = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const DialogContext = createContext<DialogContextType>({
  open: false,
  setOpen: () => {},
});

interface DialogContextProviderProps extends DialogContextType {
  children: React.ReactNode;
}

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
