/* =========================================================
   example-game.js — A ready-made game, so a first-time host
   can try everything out. The "Example game" button on the
   Set Up Game screen loads it (game-setup.js); after that it's
   just like questions the host typed, so any of it can be changed.

   Each question is [question, answer], easiest first
   (Round 1 is $100–$500, Round 2 is $200–$1,000).
   ========================================================= */

const EXAMPLE_GAME_ROUNDS = [
  // Round 1
  [
    { name: "Friendsgiving Feast", questions: [
      ["What bird is the star of most Thanksgiving dinners?", "Turkey"],
      ["What orange vegetable goes into a classic Thanksgiving pie?", "Pumpkin"],
      ["Which red berry is made into a sauce that's served with turkey?", "Cranberry"],
      ["What sauce made from meat drippings is poured over mashed potatoes?", "Gravy"],
      ["In what year was the first Macy's Thanksgiving Day Parade held?", "1924"],
    ] },
    { name: "Movies", questions: [
      ["What kind of animal is Simba in The Lion King?", "A lion"],
      ["What is the name of the cowboy in Toy Story?", "Woody"],
      ["Which Disney movie has the song \"Let It Go\"?", "Frozen"],
      ["Who directed Jurassic Park?", "Steven Spielberg"],
      ["Captain America's shield is made mostly of what made-up metal?", "Vibranium"],
    ] },
    { name: "Geography", questions: [
      ["What is the largest ocean on Earth?", "The Pacific Ocean"],
      ["What is the capital of Japan?", "Tokyo"],
      ["Which country is shaped like a boot?", "Italy"],
      ["What is the longest river in South America?", "The Amazon"],
      ["What is the smallest country in the world?", "Vatican City"],
    ] },
    { name: "Science", questions: [
      ["Which planet is known as the Red Planet?", "Mars"],
      ["What gas do plants take in from the air?", "Carbon dioxide"],
      ["What is the hardest natural material?", "Diamond"],
      ["What is the chemical symbol for gold?", "Au"],
      ["How many bones are in an adult human body?", "206"],
    ] },
    { name: "Music", questions: [
      ["How many strings does a standard guitar have?", "6"],
      ["Who is known as the King of Pop?", "Michael Jackson"],
      ["Which singer's fans are called Swifties?", "Taylor Swift"],
      ["Which band sang \"Hey Jude\"?", "The Beatles"],
      ["How many keys does a standard piano have?", "88"],
    ] },
  ],
  // Round 2
  [
    { name: "Sports", questions: [
      ["In which sport do you do a slam dunk?", "Basketball"],
      ["How many players does a soccer team have on the field?", "11"],
      ["How many points is a touchdown worth in American football?", "6"],
      ["In tennis, what word means a score of zero?", "Love"],
      ["Which country has won the most FIFA World Cups?", "Brazil"],
    ] },
    { name: "Animals", questions: [
      ["What is the fastest land animal?", "The cheetah"],
      ["What is a baby kangaroo called?", "A joey"],
      ["What is the largest animal that has ever lived?", "The blue whale"],
      ["What is the only mammal that can really fly?", "The bat"],
      ["How many hearts does an octopus have?", "Three"],
    ] },
    { name: "History", questions: [
      ["Who was the first President of the United States?", "George Washington"],
      ["Which ancient people built the pyramids of Giza?", "The Egyptians"],
      ["Who was the first person to walk on the Moon?", "Neil Armstrong"],
      ["In what year did the Titanic sink?", "1912"],
      ["In what year did the Berlin Wall fall?", "1989"],
    ] },
    { name: "Food Around the World", questions: [
      ["Sushi comes from which country?", "Japan"],
      ["Guacamole is made mostly from which fruit?", "Avocado"],
      ["Which country is famous for croissants?", "France"],
      ["Adobo is a famous dish from which country?", "The Philippines"],
      ["Which spice makes paella yellow?", "Saffron"],
    ] },
    { name: "Word Play", questions: [
      ["How many letters are in the English alphabet?", "26"],
      ["What punctuation mark ends a question?", "A question mark"],
      ["What do you call a word that reads the same backwards, like \"racecar\"?", "A palindrome"],
      ["What do you call words that sound the same but mean different things, like \"flower\" and \"flour\"?", "Homophones"],
      ["What is the plural of \"cactus\"?", "Cacti"],
    ] },
  ],
];

const EXAMPLE_GAME_FINAL_WAGER = [
  { name: "World Capitals", questions: [
    ["What is the capital of Australia?", "Canberra"],
    ["What is the capital of Canada?", "Ottawa"],
  ] },
  { name: "Space", questions: [
    ["What is the largest planet in our solar system?", "Jupiter"],
    ["What is the closest star to Earth?", "The Sun"],
  ] },
];

// The example as a setup (the same shape as gameSetup in questions.js)
function createExampleSetup() {
  const toQuestions = (pairs, withImage) =>
    pairs.map(([question, answer]) => (withImage ? { question, answer, image: "" } : { question, answer }));
  return {
    rounds: EXAMPLE_GAME_ROUNDS.map((round) =>
      round.map((category) => ({ name: category.name, questions: toQuestions(category.questions, true) }))),
    finalWager: EXAMPLE_GAME_FINAL_WAGER.map((category) => ({
      name: category.name,
      questions: toQuestions(category.questions, false),
    })),
  };
}
