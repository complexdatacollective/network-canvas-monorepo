/**
 * External link component with secure API support.
 */

import PropTypes from 'prop-types';

import { isCordova, isElectron } from '../utils/Environment';

const openExternalLink = (href) => {
  if (isElectron()) {
    if (window.electronAPI?.shell?.openExternal) {
      window.electronAPI.shell.openExternal(href);
    }
    return false;
  }

  if (isCordova()) {
    window.cordova.InAppBrowser.open(href, '_system', 'location=yes');
  }

  return false;
};

const ExternalLink = ({ children, href }) => {
  const handleClick = (event) => {
    event.preventDefault();
    openExternalLink(href);
  };

  return (
    <a href="#" onClick={handleClick}>
      {children}
    </a>
  );
};

ExternalLink.propTypes = {
  children: PropTypes.node.isRequired,
  href: PropTypes.string.isRequired,
};

export { ExternalLink };

export default ExternalLink;
