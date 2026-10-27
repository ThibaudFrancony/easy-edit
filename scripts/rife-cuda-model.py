# Fabrique resources/models/rife-v4.22-lite-cuda.onnx à partir du modèle d'origine, pour la carte NVIDIA du PC de rendu :
# le même réseau, mais les entrées et la sortie en octets RGB, telles que FFmpeg les donne. Quatre fois moins de données
# à copier vers la carte, et plus de conversion image par image en JavaScript. Le résultat est identique à l'original.
# (La demi-précision a été essayée : sur une GTX 1650, 2,6 fois plus lente et moins juste.)
# Entrées : img0, img1 (uint8, [hauteur, largeur, 3]) et timestep (float32, [1]). Sortie : frame (uint8, [hauteur, largeur, 3]).
#
# python3 -m venv /tmp/onnx && /tmp/onnx/bin/pip install onnx
# /tmp/onnx/bin/python scripts/rife-cuda-model.py
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

root = os.path.join(os.path.dirname(__file__), '..', 'resources', 'models')
model = onnx.load(os.path.join(root, 'rife-v4.22-lite.onnx'))
graph = model.graph

# Le réseau d'origine devient le milieu du graphe : on renomme son entrée et sa sortie.
core_in, core_out = graph.input[0].name, graph.output[0].name
for node in graph.node:
    node.input[:] = ['core_input' if name == core_in else name for name in node.input]
    node.output[:] = ['core_output' if name == core_out else name for name in node.output]

def const(name, values, dtype):
    graph.initializer.append(numpy_helper.from_array(np.array(values, dtype=dtype), name))

const('inv255', 1 / 255, np.float32)
const('x255', 255, np.float32)
const('zero', 0, np.float32)
const('axis0', [0], np.int64)
const('ones', [1, 1], np.int64)
const('hw_start', [0], np.int64)
const('hw_end', [2], np.int64)
const('plane_shape', [1, 1, 1, 1], np.int64)

before = [
    # Les deux images côte à côte en canaux, de 0 à 1, en plans : [1, 6, H, W].
    helper.make_node('Concat', ['img0', 'img1'], ['pair_hwc'], axis=2),
    helper.make_node('Cast', ['pair_hwc'], ['pair_f'], to=TensorProto.FLOAT),
    helper.make_node('Mul', ['pair_f', 'inv255'], ['pair_n']),
    helper.make_node('Transpose', ['pair_n'], ['pair_chw'], perm=[2, 0, 1]),
    helper.make_node('Unsqueeze', ['pair_chw', 'axis0'], ['pair']),
    # Le plan rempli de l'instant t : [1, 1, H, W].
    helper.make_node('Shape', ['img0'], ['img_shape']),
    helper.make_node('Slice', ['img_shape', 'hw_start', 'hw_end'], ['hw']),
    helper.make_node('Concat', ['ones', 'hw'], ['t_shape'], axis=0),
    helper.make_node('Cast', ['timestep'], ['t_f'], to=TensorProto.FLOAT),
    helper.make_node('Reshape', ['t_f', 'plane_shape'], ['t_1']),
    helper.make_node('Expand', ['t_1', 't_shape'], ['t_plane']),
    helper.make_node('Concat', ['pair', 't_plane'], ['core_input'], axis=1),
]
after = [
    # [1, 3, H, W] de 0 à 1 → [H, W, 3] en octets.
    helper.make_node('Squeeze', ['core_output', 'axis0'], ['out_chw']),
    helper.make_node('Transpose', ['out_chw'], ['out_hwc'], perm=[1, 2, 0]),
    helper.make_node('Mul', ['out_hwc', 'x255'], ['out_255']),
    helper.make_node('Clip', ['out_255', 'zero', 'x255'], ['out_clip']),
    helper.make_node('Round', ['out_clip'], ['out_round']),
    helper.make_node('Cast', ['out_round'], ['frame'], to=TensorProto.UINT8),
]
nodes = before + list(graph.node) + after
del graph.node[:]
graph.node.extend(nodes)

del graph.input[:]
graph.input.extend([
    helper.make_tensor_value_info('img0', TensorProto.UINT8, ['height', 'width', 3]),
    helper.make_tensor_value_info('img1', TensorProto.UINT8, ['height', 'width', 3]),
    helper.make_tensor_value_info('timestep', TensorProto.FLOAT, [1]),
])
del graph.output[:]
graph.output.extend([helper.make_tensor_value_info('frame', TensorProto.UINT8, ['height', 'width', 3])])
# Les formes intermédiaires notées par la conversion ne valent plus : ONNX Runtime les recalcule.
del graph.value_info[:]

onnx.checker.check_model(model)
onnx.save(model, os.path.join(root, 'rife-v4.22-lite-cuda.onnx'))
print('rife-v4.22-lite-cuda.onnx écrit')
