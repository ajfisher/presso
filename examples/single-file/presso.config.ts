export default {
  title: 'Presso Single File Example',
  event: 'Presso Fixture',
  date: '2026-05-22',
  author: 'ajfisher',
  excerpt: 'A compact single-file Markdown deck for testing Presso editing and writeback.',
  tags: ['presentation', 'markdown', 'presso', 'single-file'],
  baseUrl: 'https://presso-single-file-example.ajf.io',
  source: {
    type: 'file',
    path: './slides.md'
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
