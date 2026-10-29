import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTextMatch, prepareTextSearch } from '../src/server/textSearch.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';

const song = (title: string, artist: string, id = title) => ({ id, title, artist });

test('artist - title becomes a Spotify field query without a minus exclusion', () => {
  const plan = prepareTextSearch('Daft Punk - Get Lucky');
  assert.equal(plan.scoringQuery, 'Daft Punk Get Lucky');
  assert.equal(plan.titleHint, 'Get Lucky');
  assert.equal(plan.artistHint, 'Daft Punk');
  assert.equal(plan.spotifyQueries[0], 'track:"Get Lucky" artist:"Daft Punk"');
  for (const query of plan.spotifyQueries) assert.equal(/(^|\s)-/.test(query), false, query);
  const picked = pickTextMatch(plan.scoringQuery, [
    song('One More Time', 'Daft Punk', 'other'),
    song('Get Lucky', 'Daft Punk', 'studio'),
    song('Get Lucky (Live)', 'Daft Punk', 'live')
  ], { title: plan.titleHint, artist: plan.artistHint });
  assert.equal(picked?.id, 'studio');
});

test('title by artist, punctuation, and non-ascii text still match the song', () => {
  const byArtist = prepareTextSearch('play Get Lucky by Daft Punk please');
  assert.equal(byArtist.titleHint, 'Get Lucky');
  assert.equal(byArtist.artistHint, 'Daft Punk');
  assert.equal(pickTextMatch(byArtist.scoringQuery, [song('Get Lucky', 'Daft Punk', 'hit')], { title: byArtist.titleHint, artist: byArtist.artistHint })?.id, 'hit');

  const punctuated = prepareTextSearch("Queen - Don't Stop Me Now");
  assert.ok(punctuated.spotifyQueries.some(query => query.includes("Don't Stop Me Now")));
  assert.equal(pickTextMatch(punctuated.scoringQuery, [
    song('We Will Rock You', 'Queen', 'other'),
    song("Don't Stop Me Now", 'Queen', 'hit')
  ], { title: punctuated.titleHint, artist: punctuated.artistHint })?.id, 'hit');

  const accented = prepareTextSearch('Björk - Jóga');
  assert.ok(accented.textQueries.some(query => /Bjork Joga/i.test(query)));
  assert.equal(pickTextMatch(accented.scoringQuery, [song('Jóga', 'Björk', 'hit')], { title: accented.titleHint, artist: accented.artistHint })?.id, 'hit');
});

test('a text query with no shared title still produces no match', () => {
  const plan = prepareTextSearch('Daft Punk - Get Lucky');
  assert.equal(pickTextMatch(plan.scoringQuery, [song('One More Time', 'Daft Punk')], { title: plan.titleHint, artist: plan.artistHint }), null);
  assert.equal(prepareTextSearch('---').scoringQuery, '');
  assert.equal(prepareTextSearch('---').spotifyQueries.length, 0);
});

test('YouTube and Spotify links stay on the link parsers', () => {
  assert.equal(YouTubeResolver.extractVideoId('https://music.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(YouTubeResolver.extractVideoId('https://youtu.be/abcdefghijk?t=12'), 'abcdefghijk');
  assert.equal(YouTubeResolver.extractVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  const spotifyId = 'A'.repeat(22);
  assert.equal(YouTubeResolver.extractSpotifyTrackId(`https://open.spotify.com/track/${spotifyId}?si=abc`), spotifyId);
  assert.equal(YouTubeResolver.extractSpotifyTrackId(`spotify:track:${spotifyId}`), spotifyId);
  assert.equal(YouTubeResolver.extractSpotifyTrackId('Daft Punk - Get Lucky'), null);
  assert.equal(YouTubeResolver.extractVideoId('Daft Punk - Get Lucky'), null);
});

test('YouTube Music text results keep the song shelf and top result, including punctuation and duration', () => {
  const queenArtist = {
    text: 'Queen',
    navigationEndpoint: {
      browseEndpoint: {
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' }
        }
      }
    }
  };
  const candidates = YouTubeResolver.collectYtmSongCandidates({
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    musicCardShelfRenderer: {
                      title: { runs: [{ text: 'Get Lucky', navigationEndpoint: { watchEndpoint: { videoId: 'abcdefghijk' } } }] },
                      subtitle: { runs: [
                        { text: 'Song' },
                        { text: ' • ' },
                        { text: 'Daft Punk', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } },
                        { text: ' • ' },
                        { text: '4:07' }
                      ] },
                      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://example.test/cover.jpg' }] } } }
                    }
                  },
                  {
                    musicShelfRenderer: {
                      title: { runs: [{ text: 'Albums' }] },
                      contents: [{
                        musicResponsiveListItemRenderer: {
                          playlistItemData: { videoId: 'albumalbum1' },
                          flexColumns: [
                            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Random Access Memories' }] } } },
                            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Daft Punk' }] } } }
                          ]
                        }
                      }]
                    }
                  },
                  {
                    musicShelfRenderer: {
                      title: { runs: [{ text: 'Titel' }] },
                      contents: [{
                        musicResponsiveListItemRenderer: {
                          playlistItemData: { videoId: '12345678901' },
                          flexColumns: [
                            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Don't Stop Me Now" }] } } },
                            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [queenArtist, { text: ' • ' }, { text: 'A Night at the Opera' }] } } }
                          ],
                          fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:29' }] } } }],
                          overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { videoId: '12345678901', watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } } } } } } } }
                        }
                      }]
                    }
                  }
                ]
              }
            }
          }
        }]
      }
    }
  });

  assert.deepEqual(candidates.map(candidate => candidate.videoId), ['abcdefghijk', '12345678901']);
  assert.equal(candidates[0].artist, 'Daft Punk');
  assert.equal(candidates[0].duration, 247);
  assert.equal(candidates[1].title, "Don't Stop Me Now");
  assert.equal(candidates[1].artist, 'Queen');
  assert.equal(candidates[1].duration, 209);
  const plan = prepareTextSearch("Queen - Don't Stop Me Now");
  const picked = pickTextMatch(plan.scoringQuery, candidates, { title: plan.titleHint, artist: plan.artistHint });
  assert.equal(picked?.videoId, '12345678901');
});

test('a YouTube Music page without a songs heading still keeps a typed official audio result', () => {
  const candidates = YouTubeResolver.collectYtmSongCandidates({
    contents: [{
      musicShelfRenderer: {
        title: { runs: [{ text: 'Videos' }] },
        contents: [{
          musicResponsiveListItemRenderer: {
            playlistItemData: { videoId: 'officalvid1' },
            flexColumns: [
              { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Yellow' }] } } },
              { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Coldplay' }] } } }
            ],
            fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '4:29' }] } } }],
            overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { videoId: 'officalvid1', watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_OMV' } } } } } } } }
          }
        }]
      }
    }]
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].videoId, 'officalvid1');
  assert.equal(candidates[0].duration, 269);
  assert.equal(pickTextMatch('Yellow', candidates)?.title, 'Yellow');
});
