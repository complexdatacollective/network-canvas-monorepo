import { type DocFile, type Folder } from '@/types';
import Menu from './Menu';
import NavigationLink from './NavigationLink';
import OpenMenu from './OpenMenu';

export interface NavigationMenusProps {
  sidebarData: (Folder | DocFile)[];
  pathItems: string[];
}

export default function NavigationMenus({
  sidebarData,
  pathItems,
}: NavigationMenusProps): JSX.Element {
  return (
    <ul className="ml-2 flex flex-col gap-1">
      {sidebarData.map((item) => {
        if (item.type === 'folder') {
          const folder = item;
          const activeMenu = pathItems.find((pt) => pt === folder.source); //find active menu from path items
          const isFolderPageInView =
            `/${pathItems.join('/')}` === folder.folderPagePath;

          // render menu (folder)
          return (
            <li key={folder.name}>
              {folder.isExpanded ? (
                <Menu
                  highlighted={isFolderPageInView}
                  activeMenu={activeMenu}
                  itemValue={folder.source}
                  title={folder.name.toLocaleUpperCase()}
                  titleURL={folder.folderPagePath}
                >
                  <NavigationMenus
                    pathItems={pathItems}
                    sidebarData={folder.files}
                  />
                </Menu>
              ) : (
                <OpenMenu
                  highlighted={isFolderPageInView}
                  title={folder.name.toLocaleUpperCase()}
                  titleURL={folder.folderPagePath}
                >
                  <NavigationMenus
                    pathItems={pathItems}
                    sidebarData={folder.files}
                  />
                </OpenMenu>
              )}
            </li>
          );
        } else {
          const file = item;
          const isDocumentInView = `/${pathItems.join('/')}` === file.path;

          // render menu item (file)
          return (
            <li key={file.name}>
              <NavigationLink
                highlighted={isDocumentInView}
                fileName={file.name}
                filePath={file.path}
              />
            </li>
          );
        }
      })}
    </ul>
  );
}
