declare module "html-to-docx" {
  interface HtmlToDocxOptions {
    table?: { row?: { cantSplit?: boolean } };
    footer?: boolean;
    pageNumber?: boolean;
    [key: string]: unknown;
  }

  function htmlToDocx(
    htmlString: string,
    headerHtmlString?: string,
    options?: HtmlToDocxOptions
  ): Promise<Buffer>;

  export default htmlToDocx;
}
