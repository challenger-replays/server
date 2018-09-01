import { redisClientInstance as cacheController } from '../../../services/redis';
import { Snippet } from '../../types';
import {
  channelIds,
  playlistsLatestItemsList,
  search,
  uploadsPlaylistsIdList,
} from '../youtube';

const KEY_FEED = 'challenger-replays/videos/feed';
const KEY_SEARCH = 'challenger-replays/videos/query';

const FEED_EXPIRE_TIME =
  parseInt(`${process.env.CACHE_FEED_EXPIRE_TIME}`, 10) || 5 * 60;
const SEARCH_RESULTS_EXPIRE_TIME =
  parseInt(`${process.env.CACHE_SEARCH_RESULTS_EXPIRE_TIME}`, 10) || 1 * 60;

export class DataSource {
  private cacheQueues: {
    [key: string]: Array<{
      resolve: (value: Snippet[] | PromiseLike<Snippet[]>) => void;
      reject: (reason: any) => void;
    }>;
  } = {};

  public async getFeed(): Promise<Snippet[]> {
    const cache = await this.getCachedSnippets(KEY_FEED);
    if (cache) {
      return cache;
    }

    return this.loadData({
      expire: FEED_EXPIRE_TIME,
      executor: async () => {
        const ids = await uploadsPlaylistsIdList(channelIds);
        return playlistsLatestItemsList(ids);
      },
      key: KEY_FEED,
    });
  }

  public async getSearchResult(
    query: string,
    offset = 0,
    resultsPerPage = 10,
  ): Promise<Snippet[]> {
    const key = `${KEY_SEARCH}:${query}`;
    const end = offset + resultsPerPage;

    const cache = await this.getCachedSnippets(key, offset, end);
    if (cache) {
      return cache;
    }

    return this.loadData({
      expire: SEARCH_RESULTS_EXPIRE_TIME,
      executor: () => {
        return search(channelIds, query);
      },
      key,
    });
  }

  private async getCachedSnippets(
    key: string,
    start: number = 0,
    stop: number = -1,
  ): Promise<Snippet[] | undefined> {
    try {
      const cache = await cacheController.lrange<Snippet>(key, start, stop);
      if (cache && 0 < cache.length) {
        return cache;
      }
    } catch (e) {
      console.log(e);
    }

    return undefined;
  }

  private async loadData(options: {
    expire: number;
    executor: () => Promise<Snippet[]>;
    key: string;
    start?: number;
    stop?: number;
  }): Promise<Snippet[]> {
    const { expire, executor } = options;
    const key = options.key.toLowerCase().trim();
    const start = options.start || 0;
    const stop = options.stop || -1;

    const { cacheQueues } = this;
    if (!cacheQueues.hasOwnProperty(key)) {
      cacheQueues[key] = [];
    }

    const queue = cacheQueues[key];
    const promise = new Promise<Snippet[]>((resolve, reject) => {
      queue.push({ resolve, reject });
    });

    if (1 === queue.length) {
      try {
        const data = await executor();

        try {
          await cacheController.rpush(key, data);
          await cacheController.expire(key, expire);
        } catch (e) {
          console.error(e);
        }

        const result = data.slice(start, stop);
        queue.forEach(({ resolve }) => resolve(result));
      } catch (e) {
        queue.forEach(({ reject }) => reject(e));
      } finally {
        queue.splice(0); // remove all watchers
      }
    }

    return promise;
  }
}
