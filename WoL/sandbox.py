import onnxruntime_genai as og
import time

def main():
    print("Loading model...")
    
    started_timestamp = 0
    first_token_timestamp = 0

    model = og.Model(f'huggingface/Phi-3-mini-4k-instruct-onnx/cpu_and_mobile')
    print("Model loaded")
    
    tokenizer = og.Tokenizer(model)
    tokenizer_stream = tokenizer.create_stream()
    print("Tokenizer created")
    print()
    
    search_options = {}
    
    if 'max_length' not in search_options:
        search_options['max_length'] = 2048

    chat_template = '<|user|>\n{input} <|end|>\n<|assistant|>'

    while True:
        text = input("Input: ")
        
        if not text:
            print("Error, input cannot be empty")
            continue

        started_timestamp = time.time()

        prompt = f'{chat_template.format(input=text)}'

        input_tokens = tokenizer.encode(prompt)

        params = og.GeneratorParams(model)
        params.try_use_cuda_graph_with_max_batch_size(1)
        params.set_search_options(**search_options)
        params.input_ids = input_tokens
        
        generator = og.Generator(model, params)
        print("Generator created")

        print("Running generation loop ...")
        
        first = True
        new_tokens = []

        print()
        print("Output: ", end='', flush=True)

main()
