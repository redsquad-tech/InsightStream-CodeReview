import { ChatGPTAPI } from 'chatgpt';
export class Chat {
  private chatAPI: ChatGPTAPI;

  constructor(apikey: string) {
    this.chatAPI = new ChatGPTAPI({
      apiKey: apikey,
      apiBaseUrl:
        process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      completionParams: {
        model: process.env.MODEL || 'gpt-4o',
        temperature: +(process.env.temperature || 0) || 0,
        top_p: +(process.env.top_p || 0) || 1,
        max_tokens: process.env.max_tokens
          ? +process.env.max_tokens
          : undefined,
      },
    });
  };

  private addNumbersOfString(input: string, filename: string): string {
    const lines = input.split("\n");
    let result = "";

    const numberOfFirstRow = parseInt(lines[0].split(" ")[1].split(",")[0].slice(1), 10);
    let currentNumber = numberOfFirstRow;
    if (currentNumber !== 0) {
      currentNumber -= 1;
    }
    let MinusNumber = 0;

    let commentSyntax = "//";

    if (filename.endsWith(".py") || filename.endsWith("Dockerfile")) {
      commentSyntax = "#";
    }

    lines.forEach((line, idx) => {
      if (idx === 0) {
        result += line + "\n";
        return;
      }

      if (line.startsWith("-")) {
        MinusNumber += 1;
        currentNumber += 1;
        result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})\n`;
      } else {
        currentNumber -= MinusNumber;
        currentNumber += 1;
        MinusNumber = 0;

        if (idx !== lines.length - 1) {
          result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})\n`;
        } else {
          result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})`;
        }
      }
    });

    return result;
  }

  private generatePrompt = (filename: string, patch: string) => {
    let prompt = '';
    patch = this.addNumbersOfString(patch, filename)
    console.log('PATCH AFTER:-----------------------------------------------------------')
    console.log(patch)

    if (filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.py')) {
      prompt = `\
Review the provided code changes in the file "${filename}". \
Evaluate only the specified aspects.
IMPORTANT: If there are no issues for a particular aspect, completely ignore that aspect and do not mention it at all.

Aspects:
- Errors and bugs in the code.
- Checking the correspondence of function and variable names to their content. Indicate if the names do not reflect the content.
- Analysis of function decomposition in complex algorithms. Ensure that each function is easily describable and does not contain code repetitions.
- Identification of methods that should be private but are not marked as such. If a function name starts with an underscore, it means it's a private method.
- Checking for type annotations in public methods. Suggest types if they are missing.
- Checking for documentation in important public methods. Suggest writing documentation if it is missing.
- Avoiding excessive decomposition. Ensure that there are no overly short and simple functions that are used only once.

The response should be a valid JSON object in plain text without any additional formatting like code blocks or backticks. \
If there are no issues, return an empty JSON object.
Provide your response in Russian.

Example response:
{
"3": "Переменная name не отражает содержимое функции.",
"7": "Отсутствует типизация аргументов функции.",
"12": "Функция слишком длинная, рекомендуется разбить её на несколько меньших."
}

Here are the code changes for analysis:
${patch}

Your review:
`;
    }
    else {
      prompt = `\
I will provide you with the filename and the code diff from a GitHub pull request. \
Your task is to analyze these changes and provide a brief review.

Filename: ${filename}

Response rules:
1. Only discuss obvious bugs and errors. Avoid speculative comments and hypotheses.
2. The response should be a valid JSON object in plain text without any additional formatting like code blocks or backticks.
3. If there are no issues, return an empty JSON object.
4. Respond in Russian.

Example response:
{
"3": "Описание ошибки или проблемы.",
"7": "Описание другой ошибки или проблемы.",
"12": "Описание ещё одной ошибки или проблемы."
}

Here is the diff for analysis:
${patch}
`;
    }

    return prompt;
  };

  public codeReview = async (filename: string, patch: string) => {
    if (!patch) {
      return '';
    }
    console.log('PATCH BEFORE:-----------------------------------------------------------')
    console.log(patch)

    console.time('code-review cost');
    const prompt = this.generatePrompt(filename, patch);
    const res = await this.chatAPI.sendMessage(prompt);


    console.log('RES ANSWER:------------------------------------------------------')
    console.log(res.text)

    console.timeEnd('code-review cost');
    return JSON.parse(res.text);
  };
}
