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
  }

  private generatePrompt = (filename: string, patch: string) => {
    let prompt = '';

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

The response should be brief and contain only significant comments. \
Avoid discussing potential hypothetical errors and suggestions. \
Do not comment on code formatting or suggestions to move variables to a .env file. \
Provide your response in Russian.

Example response:
'''- Дублирование импортов
from langchain.chains import (
    create_history_aware_retriever,
    create_retrieval_chain,
)
from langchain.chains.history_aware_retriever import (
    create_history_aware_retriever,
)
from langchain.chains.retrieval import create_retrieval_chain

- Функция start содержит логику, которая может быть вынесена в отдельные функции для улучшения читаемости и повторного использования.

- Функция get_session_history должна быть приватной, так как используется только внутри модуля:
def _get_session_history(session_id: str) -> BaseChatMessageHistory:

- В функции start отсутствует типизация аргументов:
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:

- Отсутствует документация для функции start. Рекомендуется добавить описание:
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Обрабатывает команду /start и отправляет приветственное сообщение пользователю.
    
    Args:
        update (Update): Объект обновления Telegram.
        context (ContextTypes.DEFAULT_TYPE): Контекст выполнения команды.
    """
'''
Your response does not need to be exactly like this, but try to follow a similar format.
IMPORTANT, PLEASE NOTE:
- the response reviews different aspects and provides comments and recommendations,
- the response omits some aspects if no comments or errors are found,
in this case, they should be ignored and not mentioned at all.
- the response does not directly quote the aspect names.

Here are the code changes for analysis:
${patch}

If there are no errors, respond with: "Ошибок нет."
Your review:
`;
    } else {
      prompt = `\
I will provide you with the filename and the code diff from a GitHub pull request. \
Your task is to analyze these changes and provide a brief review.

Filename: ${filename}

Response rules:
1. Only discuss obvious bugs and errors. Avoid speculative comments and hypotheses.
2. If there are no errors, respond with: "Ошибок нет."
3. Respond in Russian.

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

    console.time('code-review cost');
    const prompt = this.generatePrompt(filename, patch);
    const res = await this.chatAPI.sendMessage(prompt);

    console.log('PATCH:------------------------------------------------------')
    console.log(patch)
    console.log('RES ANSWER:------------------------------------------------------')
    console.log(res.text)

    console.timeEnd('code-review cost');
    return res.text;
  };
}
