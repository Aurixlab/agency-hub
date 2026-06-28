type PublishInput = {
  pageId: string;
  accessToken: string;
  content: string;
  mediaUrls: string[];
};

async function graphPost(path: string, body: URLSearchParams) {
  const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: 'POST',
    body,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Meta API request failed');
  }
  return payload;
}

export async function publishToMeta(input: PublishInput) {
  if (!input.accessToken) throw new Error('Missing Meta page access token');

  const attachedMedia = [];
  for (const mediaUrl of input.mediaUrls) {
    const photo = await graphPost(`${input.pageId}/photos`, new URLSearchParams({
      url: mediaUrl,
      published: 'false',
      access_token: input.accessToken,
    }));
    attachedMedia.push({ media_fbid: photo.id });
  }

  const feedBody = new URLSearchParams({
    message: input.content,
    access_token: input.accessToken,
  });
  attachedMedia.forEach((media, index) => {
    feedBody.append(`attached_media[${index}]`, JSON.stringify(media));
  });

  return graphPost(`${input.pageId}/feed`, feedBody);
}
