import * as dates from '../../utils/dates';
import { PlaylistItems, PlaylistSnippet, PlaylistSnippets } from '../types';

function isFresh(item: dates.Dated) {
  const publishedAt = dates.parseYoutubeDate(item);
  const deltaInDays = (Date.now() - publishedAt.getMilliseconds()) / (1000 * 60 * 60 * 24);
  return deltaInDays < 6;
}

export class Feed {
  public readonly items: PlaylistSnippet[];

  public static parse(playlistsItems: PlaylistItems[] = [], length = 12): Feed {
      const playlists: PlaylistSnippets[] = playlistsItems
        .filter(playlist => (playlist.items || []).length > 0)
        .map(playlist => { // Remove 'snippet' wrapper
          const snippets = playlist.items.map(item => ({
            ...item.snippet,
            description: undefined,
            playlistId: undefined,
            position: undefined,
          }));
          return {
            items : snippets,
          };
        });

      if (0 === playlists.length) {
        throw new TypeError(`Invalid 'playlistsItems' argument: ${playlistsItems}`);
      }

      const dateDescComparator = dates.compareYoutubeDates('desc');

      playlists.forEach(playlist => playlist.items.sort(dateDescComparator));

      const necessary = playlists
        .map(playlist => playlist.items[0])
        .filter(item => isFresh(item));

      const tails = playlists.map(playlist => playlist.items.slice(1));
      const extras = ([] as PlaylistSnippet[])
        .concat(...tails)
        .sort(dateDescComparator);

      const items = necessary
        .concat(extras)
        .splice(0, length)
        .sort(dateDescComparator);

      return new Feed(items);
  }

  constructor(items: PlaylistSnippet[] = []) {
    this.items = [...items];
  }
}