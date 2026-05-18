export default {
  title: 'Presso Basic Example',
  event: 'Presso Fixture',
  date: '2026-05-18',
  author: 'ajfisher',
  excerpt: 'A small Markdown-native deck that exercises Presso runtime, notes, export, and metadata output.',
  tags: ['presentation', 'markdown', 'presso'],
  featureImage: './assets/example.svg',
  baseUrl: 'https://presso-example.ajf.io',
  source: {
    type: 'folder',
    path: './slides'
  },
  theme: './theme.css',
  notes: {
    public: 'toggle',
    defaultPrintLayout: 'page'
  },
  size: {
    width: 1280,
    height: 720
  }
};
