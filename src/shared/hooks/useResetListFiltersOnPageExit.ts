import { useEffect } from 'react';

/**
 * Clears transient list filters when the user leaves a business page.
 * Detail dialogs stay inside the page, so opening and closing them does not
 * trigger the reset. Each store decides which durable preferences to retain.
 */
const useResetListFiltersOnPageExit = (resetListFilters: () => void) => {
  useEffect(() => () => resetListFilters(), [resetListFilters]);
};

export default useResetListFiltersOnPageExit;
