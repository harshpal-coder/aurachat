import Sentiment from 'sentiment';

export class SentimentAnalyzer {
  constructor() {
    this.sentiment = new Sentiment();
    this.MOODS = {
      happy: ['happy', 'lol', 'haha', 'great', 'awesome', 'good', 'nice', 'yay', '😊', '😂'],
      angry: ['angry', 'mad', 'hate', 'stupid', 'dumb', 'stop', 'no', 'wtf', '😠', '😡'],
      sad: ['sad', 'cry', 'bad', 'sorry', 'depressed', 'alone', 'hurt', '😢', '😭'],
      romantic: ['love', 'cute', 'heart', 'kiss', 'date', 'beautiful', 'sweet', '❤️', '😍'],
      excited: ['wow', 'omg', 'excited', 'amazing', 'unreal', 'cool', 'hype', '🔥', '✨'],
      chill: ['chill', 'vibe', 'relax', 'cool', 'bro', 'homie', 'peace', '🤙', '😎']
    };
  }

  detectMood(text) {
    const analysis = this.sentiment.analyze(text);
    const score = analysis.score;
    const lowercaseText = text.toLowerCase();

    // 1. Priority: Specific Keyword Matches (Romantic/Chill/Excited)
    if (this.MOODS.romantic.some(kw => lowercaseText.includes(kw))) return 'romantic';
    if (this.MOODS.chill.some(kw => lowercaseText.includes(kw))) return 'chill';
    if (this.MOODS.excited.some(kw => lowercaseText.includes(kw))) return 'excited';

    // 2. Sentiment Scoring
    if (score >= 4) return 'excited';
    if (score >= 1) return 'happy';
    if (score <= -4) return 'angry';
    if (score <= -1) return 'sad';

    // 3. Fallback: Generic Keywords
    for (const [mood, keywords] of Object.entries(this.MOODS)) {
      if (keywords.some(keyword => lowercaseText.includes(keyword))) {
        return mood;
      }
    }

    return null;
  }
}
